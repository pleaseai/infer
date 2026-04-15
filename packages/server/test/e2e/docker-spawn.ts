import type { Arch, SubprocessLike } from '@pleaseai/infer-tei'
import process from 'node:process'
import {
  createDockerSpawn,
  defaultDockerSpawnDeps,
  defaultHfCacheHost,
  dockerFindBinary as prodFindBinary,
  hasDocker as prodHasDocker,
  resolveTeiImage,
} from '@pleaseai/infer-tei'

/**
 * Resolve the arch string the TEI image resolver expects from current Node env.
 * Duplicated here (rather than imported from the server package) because the
 * E2E helpers live under `packages/server` and we want `docker-spawn.ts` to
 * stay dependency-free from server internals.
 */
function resolveArch(): Arch {
  if (process.platform === 'darwin')
    return process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64'
  if (process.platform === 'linux')
    return process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64'
  return 'unknown'
}

/**
 * TEI image used by the E2E suite. Resolved the same way production does —
 * via `resolveTeiImage` — so CI/local hosts pick `cpu` on x86_64 and
 * `cpu-arm64` on Apple Silicon. No digest pin here: first run `docker pull`s,
 * subsequent runs reuse.
 *
 * E2E explicitly sets `gpu: null` so tests never require nvidia-smi or
 * NVIDIA Container Toolkit. If a CI lane needs GPU coverage, extend this
 * module with a separate `TEI_GPU_IMAGE` export.
 */
export const TEI_IMAGE: string = resolveTeiImage({
  gpu: null,
  arch: resolveArch(),
  imageTag: '1.9',
  override: undefined,
}).ref

/**
 * Stand-in for `findTeiBinary` when running E2E tests via Docker.
 * The returned string is passed through to `dockerSpawnFn` which ignores it;
 * TeiManager only requires that `findBinary()` succeeds.
 */
export function dockerFindBinary(): string {
  return prodFindBinary()
}

/**
 * Drop-in replacement for `Bun.spawn` used by TeiManager during E2E tests.
 * Delegates to the production `createDockerSpawn` factory so the E2E path and
 * the production path share one code path and one image reference policy.
 *
 * Container port 80 is mapped to the host port TeiManager allocated so that
 * the existing `waitForHealthy` (`GET http://localhost:$PORT/health`) and
 * `TeiClient` (`POST http://localhost:$PORT/embed`) paths work unchanged.
 */
const dockerSpawn = createDockerSpawn(defaultDockerSpawnDeps(TEI_IMAGE, false))
const _hfCacheHost = defaultHfCacheHost() // Force module-load to surface HF_HOME issues early.

export function dockerSpawnFn(cmd: string[]): SubprocessLike {
  return dockerSpawn(cmd)
}

/**
 * Probe whether Docker is usable on this host. Cheap synchronous check —
 * used by the E2E skip gate.
 */
export function hasDocker(): boolean {
  return prodHasDocker()
}

// Suppress "declared but never used" warnings for the HF_HOME sanity probe.
void _hfCacheHost
