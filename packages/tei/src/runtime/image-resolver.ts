import type { GpuInfo } from './gpu-detect'

export type Arch = 'linux-x64' | 'linux-arm64' | 'darwin-arm64' | 'darwin-x64' | 'unknown'

export interface ResolveTeiImageInput {
  gpu: GpuInfo | null
  arch: Arch
  imageTag: string
  override: string | undefined
}

export interface ResolveTeiImageResult {
  ref: string
  isExperimental: boolean
  reason: string
}

const REPO = 'ghcr.io/huggingface/text-embeddings-inference'

interface VariantSpec {
  tagPrefix: string
  experimental: boolean
}

// Compute capability → TEI image variant tag prefix.
// Ampere 8.0 uses the bare version tag (e.g. "1.9" with no prefix).
// Source: https://github.com/huggingface/text-embeddings-inference#docker-images
const COMPUTE_CAP_MAP: Record<string, VariantSpec> = {
  '7.5': { tagPrefix: 'turing-', experimental: true }, // Turing (T4, RTX 20xx)
  '8.0': { tagPrefix: '', experimental: false }, // Ampere (A100, A30)
  '8.6': { tagPrefix: '86-', experimental: false }, // Ampere (A10, A40)
  '8.9': { tagPrefix: '89-', experimental: false }, // Ada Lovelace (RTX 40xx)
  '9.0': { tagPrefix: 'hopper-', experimental: false }, // Hopper (H100)
  '10.0': { tagPrefix: '100-', experimental: true }, // Blackwell (B200)
  '12.0': { tagPrefix: '120-', experimental: true }, // Blackwell (RTX 50xx)
  '12.1': { tagPrefix: '121-', experimental: true }, // Blackwell (DGX Spark)
}

function archToCpuPrefix(arch: Arch): 'cpu-' | 'cpu-arm64-' {
  return arch === 'darwin-arm64' || arch === 'linux-arm64' ? 'cpu-arm64-' : 'cpu-'
}

/**
 * Resolve the TEI Docker image reference for a host environment.
 *
 * Priority: `override` (full ref) → GPU compute capability mapping → arch-based CPU fallback.
 *
 * Volta (7.0) is explicitly unsupported by TEI — those hosts fall back to the CPU variant
 * with a descriptive `reason` so callers can surface the constraint to users.
 *
 * Pure function: no I/O, no side effects, no randomness.
 */
export function resolveTeiImage(input: ResolveTeiImageInput): ResolveTeiImageResult {
  const { gpu, arch, imageTag, override } = input

  if (override) {
    return {
      ref: override,
      isExperimental: false,
      reason: 'override: tei.image was set explicitly',
    }
  }

  if (gpu) {
    const spec = COMPUTE_CAP_MAP[gpu.computeCap]
    if (spec) {
      return {
        ref: `${REPO}:${spec.tagPrefix}${imageTag}`,
        isExperimental: spec.experimental,
        reason: `compute capability ${gpu.computeCap}${spec.experimental ? ' (experimental variant)' : ''}`,
      }
    }

    // Volta (7.0) and unknown capabilities: fall back to CPU with explanation.
    const reason
      = gpu.computeCap === '7.0'
        ? `compute capability 7.0 (Volta) is not supported by TEI — falling back to CPU variant`
        : `unknown compute capability ${gpu.computeCap} — falling back to CPU variant`
    return {
      ref: `${REPO}:${archToCpuPrefix(arch)}${imageTag}`,
      isExperimental: false,
      reason,
    }
  }

  // No GPU detected.
  return {
    ref: `${REPO}:${archToCpuPrefix(arch)}${imageTag}`,
    isExperimental: false,
    reason: `no GPU detected on ${arch} — using CPU variant`,
  }
}
