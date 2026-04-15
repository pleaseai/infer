import { execFileSync } from 'node:child_process'

/**
 * GPU information relevant to TEI image variant selection.
 *
 * `computeCap` is the NVIDIA compute capability string (e.g. "8.9") reported
 * by `nvidia-smi --query-gpu=compute_cap`. Only the first GPU is used for
 * variant selection — heterogeneous multi-GPU hosts are out of scope.
 */
export interface GpuInfo {
  computeCap: string
  count: number
}

/**
 * Shape of `execFileSync` that this module depends on — injectable for tests
 * so that unit tests never invoke a real `nvidia-smi`.
 */
export type ExecFileSyncFn = (
  cmd: string,
  args: string[],
  opts: { encoding: 'utf-8', timeout: number },
) => string

const defaultExecFn: ExecFileSyncFn = ((cmd, args, opts) =>
  execFileSync(cmd, args, opts)) as ExecFileSyncFn

/**
 * Detect the first NVIDIA GPU's compute capability via `nvidia-smi`.
 *
 * Returns `null` on any failure (nvidia-smi not found, timeout, empty output,
 * parse error). Never throws — callers treat a `null` as "no GPU available"
 * and fall back to CPU variant.
 *
 * @param execFn - Optional `execFileSync` override (for tests).
 */
export function detectGpu(execFn: ExecFileSyncFn = defaultExecFn): GpuInfo | null {
  try {
    const raw = execFn('nvidia-smi', ['--query-gpu=compute_cap', '--format=csv,noheader'], {
      encoding: 'utf-8',
      timeout: 5000,
    })

    const caps = raw
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)

    if (caps.length === 0)
      return null

    return { computeCap: caps[0]!, count: caps.length }
  }
  catch {
    return null
  }
}
