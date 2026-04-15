import { describe, expect, it, mock } from 'bun:test'
import { detectGpu } from './gpu-detect'

describe('detectGpu', () => {
  it('returns null when nvidia-smi is not found', () => {
    const execFn = mock(() => {
      throw new Error('command not found: nvidia-smi')
    })
    expect(detectGpu(execFn)).toBeNull()
  })

  it('returns computeCap and count for single GPU', () => {
    const execFn = mock(() => '8.9\n')
    const result = detectGpu(execFn)
    expect(result).toEqual({ computeCap: '8.9', count: 1 })
  })

  it('uses first GPU compute capability when multiple GPUs are present', () => {
    const execFn = mock(() => '8.6\n8.6\n9.0\n')
    const result = detectGpu(execFn)
    expect(result).toEqual({ computeCap: '8.6', count: 3 })
  })

  it('returns null when nvidia-smi produces empty output', () => {
    const execFn = mock(() => '')
    expect(detectGpu(execFn)).toBeNull()
  })

  it('returns null when execFn throws (timeout, permission, etc.)', () => {
    const execFn = mock(() => {
      throw new Error('ETIMEDOUT')
    })
    expect(detectGpu(execFn)).toBeNull()
  })

  it('trims whitespace and ignores blank lines', () => {
    const execFn = mock(() => '  8.0  \n\n  \n')
    expect(detectGpu(execFn)).toEqual({ computeCap: '8.0', count: 1 })
  })

  it('calls nvidia-smi with compute_cap query and 5s timeout', () => {
    const execFn = mock(() => '8.9')
    detectGpu(execFn)
    expect(execFn).toHaveBeenCalledTimes(1)
    const [cmd, args, opts] = execFn.mock.calls[0]!
    expect(cmd).toBe('nvidia-smi')
    expect(args).toEqual(['--query-gpu=compute_cap', '--format=csv,noheader'])
    expect((opts as { timeout?: number }).timeout).toBe(5000)
  })
})
