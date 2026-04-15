import type { Buffer } from 'node:buffer'
import { execFileSync, spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

/**
 * The TEI Docker image used for E2E tests. Kept on the floating `cpu-latest`
 * tag intentionally so tests pick up upstream TEI fixes without a code change;
 * the tradeoff is that a breaking upstream change surfaces first in CI.
 *
 * When updating this, also update the pre-pull step in .github/workflows/ci.yml
 * so the image name in logs matches what tests actually run.
 */
export const TEI_IMAGE = 'ghcr.io/huggingface/text-embeddings-inference:cpu-latest'

const HF_CACHE_HOST = process.env.HF_HOME ?? join(homedir(), '.cache', 'huggingface')

interface SubprocessLike {
  kill: () => void
  exited: Promise<number>
}

/**
 * Stand-in for `findTeiBinary` when running E2E tests via Docker.
 * The returned string is passed through to `dockerSpawnFn` which ignores it;
 * TeiManager only requires that `findBinary()` succeeds.
 */
export function dockerFindBinary(): string {
  return 'docker'
}

/**
 * Drop-in replacement for `Bun.spawn` used by TeiManager during E2E tests.
 * Runs the TEI Docker image instead of invoking a native binary.
 *
 * Container port 80 is mapped to the host port TeiManager allocated so that
 * the existing `waitForHealthy` (`GET http://localhost:$PORT/health`) and
 * `TeiClient` (`POST http://localhost:$PORT/embed`) paths work unchanged.
 */
export function dockerSpawnFn(cmd: string[]): SubprocessLike {
  const portIdx = cmd.indexOf('--port')
  const modelIdx = cmd.indexOf('--model-id')
  if (portIdx < 0 || modelIdx < 0) {
    throw new Error(`dockerSpawnFn: missing --port or --model-id in cmd: ${cmd.join(' ')}`)
  }
  const hostPort = cmd[portIdx + 1]!
  const modelId = cmd[modelIdx + 1]!

  const containerId = execFileSync(
    'docker',
    [
      'run',
      '-d',
      '--rm',
      '-p',
      `${hostPort}:80`,
      '-v',
      `${HF_CACHE_HOST}:/data`,
      TEI_IMAGE,
      '--model-id',
      modelId,
      '--port',
      '80',
    ],
    { encoding: 'utf-8', timeout: 30_000 },
  ).trim()

  const waitProc = spawn('docker', ['wait', containerId], { stdio: ['ignore', 'pipe', 'ignore'] })
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
        execFileSync('docker', ['stop', '-t', '2', containerId], {
          stdio: 'ignore',
          timeout: 15_000,
        })
      }
      catch {
        // Container may already be gone (idle-timeout race, crash, etc.).
        // `exited` will still resolve via `docker wait` exit.
      }
    },
    exited,
  }
}

/**
 * Probe whether Docker is usable on this host. Cheap synchronous check —
 * used by the E2E skip gate.
 */
export function hasDocker(): boolean {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 5_000 })
    return true
  }
  catch {
    return false
  }
}
