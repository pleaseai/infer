import type { ChildProcess } from 'node:child_process'
import { execFileSync, spawn as nodeSpawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

/**
 * Minimal subprocess-like interface TeiManager depends on.
 * Keep in sync with `TeiManager`'s internal `SubprocessLike` type.
 */
export interface SubprocessLike {
  kill: () => void
  exited: Promise<number>
}

/** Injectable execFileSync — cmd, args, opts. Throws on non-zero exit. */
export type ExecFileSyncFn = (
  cmd: string,
  args: string[],
  opts: { encoding?: 'utf-8', timeout?: number, stdio?: 'ignore' | 'pipe' | Array<'ignore' | 'pipe'> },
) => string

/** Injectable spawn — returns a long-running ChildProcess for `docker wait`. */
export type SpawnFn = (
  cmd: string,
  args: string[],
  opts?: { stdio?: Array<'ignore' | 'pipe'> },
) => Pick<ChildProcess, 'stdout' | 'on'>

export interface DockerSpawnDeps {
  execFileSyncFn: ExecFileSyncFn
  spawnFn: SpawnFn
  hfCacheHost: string
  image: string
  useGpu: boolean
}

const defaultExecFn: ExecFileSyncFn = ((cmd, args, opts) =>
  execFileSync(cmd, args, opts as Parameters<typeof execFileSync>[2])) as ExecFileSyncFn
const defaultSpawnFn: SpawnFn = ((cmd, args, opts) =>
  nodeSpawn(cmd, args, opts as Parameters<typeof nodeSpawn>[2])) as SpawnFn

/**
 * Default HuggingFace cache location on host (respects `$HF_HOME` override).
 * The container always reads from `/data` — the mount mapping below translates.
 */
export function defaultHfCacheHost(): string {
  return process.env.HF_HOME ?? join(homedir(), '.cache', 'huggingface')
}

/**
 * Build a drop-in replacement for `Bun.spawn()` that runs TEI inside a Docker
 * container. The returned `SpawnFn` has the exact same shape TeiManager expects
 * — cmd is `[binary, '--model-id', M, '--port', P]` — so lifecycle (health
 * check, idle timeout, crash recovery) works unchanged against the container.
 *
 * Container port 80 is mapped to the host port the caller allocated; TeiClient
 * talks to `http://localhost:<hostPort>/embed` as in native mode.
 *
 * Dependencies are injected via `DockerSpawnDeps` so unit tests run without
 * invoking real `docker` or `nvidia-smi`.
 */
export function createDockerSpawn(deps: DockerSpawnDeps): (cmd: string[]) => SubprocessLike {
  const { execFileSyncFn, spawnFn, hfCacheHost, image, useGpu } = deps

  return (cmd: string[]): SubprocessLike => {
    const portIdx = cmd.indexOf('--port')
    const modelIdx = cmd.indexOf('--model-id')
    if (portIdx < 0 || portIdx + 1 >= cmd.length)
      throw new Error(`dockerSpawn: missing --port in cmd: ${cmd.join(' ')}`)
    if (modelIdx < 0 || modelIdx + 1 >= cmd.length)
      throw new Error(`dockerSpawn: missing --model-id in cmd: ${cmd.join(' ')}`)

    const hostPort = cmd[portIdx + 1]!
    const modelId = cmd[modelIdx + 1]!

    const dockerArgs: string[] = ['run', '-d', '--rm']
    if (useGpu)
      dockerArgs.push('--gpus', 'all')
    dockerArgs.push('-p', `${hostPort}:80`, '-v', `${hfCacheHost}:/data`, image, '--model-id', modelId, '--port', '80')

    const containerId = execFileSyncFn('docker', dockerArgs, {
      encoding: 'utf-8',
      timeout: 30_000,
    }).trim()

    const waitProc = spawnFn('docker', ['wait', containerId], { stdio: ['ignore', 'pipe'] })

    let codeOutput = ''
    waitProc.stdout?.on('data', (chunk: Buffer) => {
      codeOutput += chunk.toString()
    })

    const exited = new Promise<number>((resolve) => {
      waitProc.on('close', () => {
        const code = Number.parseInt(codeOutput.trim(), 10)
        resolve(Number.isNaN(code) ? 0 : code)
      })
    })

    return {
      kill: () => {
        try {
          execFileSyncFn('docker', ['stop', '-t', '2', containerId], {
            stdio: 'ignore',
            timeout: 15_000,
          })
        }
        catch {
          // Container may already be gone (idle-timeout race, crash, manual stop).
          // `exited` still resolves via `docker wait`.
        }
      },
      exited,
    }
  }
}

/** Default dependency bundle using real node:child_process. */
export function defaultDockerSpawnDeps(image: string, useGpu: boolean): DockerSpawnDeps {
  return {
    execFileSyncFn: defaultExecFn,
    spawnFn: defaultSpawnFn,
    hfCacheHost: defaultHfCacheHost(),
    image,
    useGpu,
  }
}

/**
 * Stand-in findBinary used with `createDockerSpawn`. TeiManager passes the
 * returned string into spawnFn unchanged; the docker spawn ignores it.
 */
export function dockerFindBinary(): string {
  return 'docker'
}

/**
 * Probe whether Docker is usable on this host. Cheap synchronous check.
 * Never throws — all errors collapse to `false`.
 */
export function hasDocker(execFn: ExecFileSyncFn = defaultExecFn): boolean {
  try {
    execFn('docker', ['info'], { stdio: 'ignore', timeout: 5000 })
    return true
  }
  catch {
    return false
  }
}
