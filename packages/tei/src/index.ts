import type { RuntimeResolution } from './runtime/runtime-selector'
import type { TeiManagerOptions } from './types'

import { TeiManager } from './tei-manager'

export { findTeiBinary } from './binary'
export { PortPool } from './port-pool'
export type { PortRange } from './port-pool'
export {
  createDockerSpawn,
  defaultDockerSpawnDeps,
  defaultHfCacheHost,
  dockerFindBinary,
  hasDocker,
} from './runtime/docker-spawn'

export type {
  DockerSpawnDeps,
  SpawnFn as DockerSpawnFn,
  ExecFileSyncFn,
  SubprocessLike,
} from './runtime/docker-spawn'

export type { GpuInfo } from './runtime/gpu-detect'

export { detectGpu } from './runtime/gpu-detect'
// Runtime selection (native vs docker) — production exports.
export type { Arch, ResolveTeiImageInput, ResolveTeiImageResult } from './runtime/image-resolver'
export { resolveTeiImage } from './runtime/image-resolver'
export type {
  RuntimeMode,
  RuntimeResolution,
  SelectRuntimeInput,
  TeiRuntimeConfig,
} from './runtime/runtime-selector'
export { defaultSelectRuntimeInput, selectRuntime } from './runtime/runtime-selector'
export { TeiClient } from './tei-client'
export { TeiManager } from './tei-manager'
export type {
  EmbedRequest,
  EmbedResponse,
  RerankRequest,
  RerankResponse,
  RerankResult,
  TeiClientOptions,
  TeiManagerOptions,
  TeiProcess,
  TeiProcessState,
} from './types'

/**
 * Factory for `TeiManager`.
 *
 * Backward-compatible one-arg signature is preserved — passing only `options`
 * yields the legacy native-binary behavior. Passing a `runtime` resolution
 * (from `selectRuntime`) switches spawn/findBinary to the resolved strategy
 * (native vs docker) without touching `TeiManager` lifecycle code.
 */
export function createTeiManager(
  options?: Partial<TeiManagerOptions>,
  runtime?: RuntimeResolution,
): TeiManager {
  if (runtime) {
    return new TeiManager(options, runtime.spawnFn, undefined, runtime.findBinary)
  }
  return new TeiManager(options)
}
