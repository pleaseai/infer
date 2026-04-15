import type { SubprocessLike } from './docker-spawn'
import type { GpuInfo } from './gpu-detect'
import type { Arch } from './image-resolver'
import { findTeiBinary } from '../binary'
import { createDockerSpawn, defaultDockerSpawnDeps, dockerFindBinary, hasDocker } from './docker-spawn'
import { detectGpu } from './gpu-detect'
import { resolveTeiImage } from './image-resolver'

export type RuntimeMode = 'native' | 'docker' | 'auto'

/**
 * User-facing TEI runtime configuration (from `infer.yaml` tei section).
 * Kept minimal and decoupled from the server `Config` type to avoid a circular dep.
 */
export interface TeiRuntimeConfig {
  runtime: RuntimeMode
  imageTag: string
  image: string | undefined
}

/**
 * Factory that builds the docker-backed `SpawnFn` for a resolved image.
 * Tests inject a capturing double so they can assert `--gpus all` / mount paths
 * without spawning real containers.
 */
export type DockerSpawnFactory = (
  image: string,
  useGpu: boolean,
  hfCacheHost: string,
) => (cmd: string[]) => SubprocessLike

/** Inputs for `selectRuntime`. All I/O dependencies are injectable for tests. */
export interface SelectRuntimeInput {
  config: TeiRuntimeConfig
  arch: Arch
  dockerInfoFn: () => boolean
  gpuDetectFn: () => GpuInfo | null
  findBinaryFn: () => string
  hfCacheHost: string
  dockerSpawnFactory?: DockerSpawnFactory
}

/** Production default: wrap `createDockerSpawn(defaultDockerSpawnDeps)` with the provided cache host. */
export const defaultDockerSpawnFactory: DockerSpawnFactory = (image, useGpu, hfCacheHost) => {
  const deps = defaultDockerSpawnDeps(image, useGpu)
  deps.hfCacheHost = hfCacheHost
  return createDockerSpawn(deps)
}

/**
 * Output of `selectRuntime` — ready-to-use DI slots for `TeiManager` plus
 * human-readable log lines and (for docker mode) the resolved image reference.
 */
export interface RuntimeResolution {
  mode: 'native' | 'docker'
  spawnFn: (cmd: string[], opts?: Record<string, unknown>) => SubprocessLike
  findBinary: () => string
  imageRef: string | undefined
  logLines: string[]
}

const bunSpawn: RuntimeResolution['spawnFn'] = (cmd, opts) =>
  (Bun.spawn as unknown as (c: string[], o?: unknown) => SubprocessLike)(cmd, opts)

/**
 * Decide how TEI backends should be launched on this host.
 *
 * - `native`: use `text-embeddings-router` on $PATH (no Docker interaction)
 * - `docker`: require Docker, resolve image via GPU compute capability + arch
 * - `auto`:   try docker first; if unavailable, fall back to native
 *
 * Side-effectful dependencies (`docker info`, `nvidia-smi`, `Bun.which`) are
 * called at most once per invocation (NFR-1).
 */
export function selectRuntime(input: SelectRuntimeInput): RuntimeResolution {
  const { config, arch, dockerInfoFn, gpuDetectFn, findBinaryFn, hfCacheHost } = input
  const dockerSpawnFactory = input.dockerSpawnFactory ?? defaultDockerSpawnFactory
  const logLines: string[] = []

  if (config.runtime === 'native') {
    logLines.push('tei: runtime=native (text-embeddings-router)')
    return {
      mode: 'native',
      spawnFn: bunSpawn,
      findBinary: findBinaryFn,
      imageRef: undefined,
      logLines,
    }
  }

  if (config.runtime === 'docker') {
    if (!dockerInfoFn()) {
      throw new Error(
        'Docker not available — install Docker Desktop or set `tei.runtime: native`',
      )
    }
    return buildDockerResolution({ config, arch, gpuDetectFn, hfCacheHost, logLines, dockerSpawnFactory })
  }

  // runtime: auto
  if (!dockerInfoFn()) {
    logLines.push('tei: Docker not available — falling back to native runtime')
    return {
      mode: 'native',
      spawnFn: bunSpawn,
      findBinary: findBinaryFn,
      imageRef: undefined,
      logLines,
    }
  }

  return buildDockerResolution({ config, arch, gpuDetectFn, hfCacheHost, logLines, dockerSpawnFactory })
}

interface DockerResolutionArgs {
  config: TeiRuntimeConfig
  arch: Arch
  gpuDetectFn: () => GpuInfo | null
  hfCacheHost: string
  logLines: string[]
  dockerSpawnFactory: DockerSpawnFactory
}

function buildDockerResolution(args: DockerResolutionArgs): RuntimeResolution {
  const { config, arch, gpuDetectFn, hfCacheHost, logLines, dockerSpawnFactory } = args

  // With an override, skip GPU detection entirely — the user has dictated the image.
  const gpu = config.image ? null : gpuDetectFn()

  const resolved = resolveTeiImage({
    gpu,
    arch,
    imageTag: config.imageTag,
    override: config.image,
  })

  logLines.push(`tei: runtime=docker image=${resolved.ref} (${resolved.reason})`)
  if (resolved.isExperimental) {
    logLines.push(
      `tei: warning — using experimental TEI image variant. Behavior may change between releases.`,
    )
  }

  // `gpu` is already forced null when `config.image` is set (line above),
  // so a single predicate captures the invariant.
  const useGpu = gpu !== null
  const dockerSpawn = dockerSpawnFactory(resolved.ref, useGpu, hfCacheHost)

  return {
    mode: 'docker',
    spawnFn: (cmd: string[]) => dockerSpawn(cmd),
    findBinary: dockerFindBinary,
    imageRef: resolved.ref,
    logLines,
  }
}

// --- Default dependency factories ---------------------------------------------

/** Convenience: build `SelectRuntimeInput` with production defaults. */
export function defaultSelectRuntimeInput(
  config: TeiRuntimeConfig,
  arch: Arch,
  hfCacheHost: string,
): SelectRuntimeInput {
  return {
    config,
    arch,
    dockerInfoFn: () => hasDocker(),
    gpuDetectFn: () => detectGpu(),
    findBinaryFn: () => findTeiBinary(),
    hfCacheHost,
  }
}
