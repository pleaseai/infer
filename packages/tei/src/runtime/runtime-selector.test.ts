import type { SelectRuntimeInput } from './runtime-selector'
import { describe, expect, it, mock } from 'bun:test'
import { selectRuntime } from './runtime-selector'

const REPO = 'ghcr.io/huggingface/text-embeddings-inference'
const NATIVE_BINARY = '/opt/homebrew/bin/text-embeddings-router'

function baseInput(overrides: Partial<SelectRuntimeInput> = {}): SelectRuntimeInput {
  return {
    config: { runtime: 'auto', imageTag: '1.9', image: undefined },
    arch: 'linux-x64',
    dockerInfoFn: mock(() => true),
    gpuDetectFn: mock(() => null),
    findBinaryFn: mock(() => NATIVE_BINARY),
    hfCacheHost: '/home/u/.cache/huggingface',
    ...overrides,
  }
}

describe('selectRuntime', () => {
  describe('runtime: native', () => {
    it('always uses native binary regardless of docker/gpu availability', () => {
      const input = baseInput({ config: { runtime: 'native', imageTag: '1.9', image: undefined } })
      const result = selectRuntime(input)
      expect(result.mode).toBe('native')
      expect(result.findBinary()).toBe(NATIVE_BINARY)
      expect(result.imageRef).toBeUndefined()
      expect(result.logLines.some(l => /native/i.test(l))).toBe(true)
    })
  })

  describe('runtime: docker', () => {
    it('throws fast-fail when docker is not available', () => {
      const input = baseInput({
        config: { runtime: 'docker', imageTag: '1.9', image: undefined },
        dockerInfoFn: mock(() => false),
      })
      expect(() => selectRuntime(input)).toThrow(/docker.*(not available|install)/i)
    })

    it('resolves image with GPU auto-detect when docker is available', () => {
      const input = baseInput({
        config: { runtime: 'docker', imageTag: '1.9', image: undefined },
        dockerInfoFn: mock(() => true),
        gpuDetectFn: mock(() => ({ computeCap: '8.9', count: 1 })),
      })
      const result = selectRuntime(input)
      expect(result.mode).toBe('docker')
      expect(result.imageRef).toBe(`${REPO}:89-1.9`)
    })

    it('uses override image verbatim and skips GPU detection', () => {
      const gpuDetectFn = mock(() => ({ computeCap: '8.9', count: 1 }))
      const input = baseInput({
        config: { runtime: 'docker', imageTag: '1.9', image: `${REPO}@sha256:xyz` },
        dockerInfoFn: mock(() => true),
        gpuDetectFn,
      })
      const result = selectRuntime(input)
      expect(result.imageRef).toBe(`${REPO}@sha256:xyz`)
      expect(gpuDetectFn).not.toHaveBeenCalled()
    })
  })

  describe('runtime: auto', () => {
    it('falls back to native when docker is not available', () => {
      const input = baseInput({
        dockerInfoFn: mock(() => false),
      })
      const result = selectRuntime(input)
      expect(result.mode).toBe('native')
      expect(result.logLines.some(l => /docker.*not available.*native/i.test(l))).toBe(true)
    })

    it('uses CPU variant when docker available but no GPU', () => {
      const input = baseInput({
        arch: 'linux-x64',
        dockerInfoFn: mock(() => true),
        gpuDetectFn: mock(() => null),
      })
      const result = selectRuntime(input)
      expect(result.mode).toBe('docker')
      expect(result.imageRef).toBe(`${REPO}:cpu-1.9`)
    })

    it('uses cpu-arm64 variant on Apple Silicon without GPU', () => {
      const input = baseInput({
        arch: 'darwin-arm64',
        dockerInfoFn: mock(() => true),
        gpuDetectFn: mock(() => null),
      })
      const result = selectRuntime(input)
      expect(result.imageRef).toBe(`${REPO}:cpu-arm64-1.9`)
    })

    it('selects GPU variant by compute capability', () => {
      const input = baseInput({
        arch: 'linux-x64',
        dockerInfoFn: mock(() => true),
        gpuDetectFn: mock(() => ({ computeCap: '8.9', count: 1 })),
      })
      const result = selectRuntime(input)
      expect(result.imageRef).toBe(`${REPO}:89-1.9`)
    })

    it('emits warning logLine for experimental variants (Turing)', () => {
      const input = baseInput({
        arch: 'linux-x64',
        dockerInfoFn: mock(() => true),
        gpuDetectFn: mock(() => ({ computeCap: '7.5', count: 1 })),
      })
      const result = selectRuntime(input)
      expect(result.imageRef).toBe(`${REPO}:turing-1.9`)
      expect(result.logLines.some(l => /experimental/i.test(l))).toBe(true)
    })

    it('emits warning logLine for experimental Blackwell variants', () => {
      const input = baseInput({
        dockerInfoFn: mock(() => true),
        gpuDetectFn: mock(() => ({ computeCap: '12.0', count: 1 })),
      })
      const result = selectRuntime(input)
      expect(result.imageRef).toBe(`${REPO}:120-1.9`)
      expect(result.logLines.some(l => /experimental/i.test(l))).toBe(true)
    })

    it('respects tei.image override (docker mode, skip GPU detect)', () => {
      const gpuDetectFn = mock(() => ({ computeCap: '8.9', count: 1 }))
      const input = baseInput({
        config: { runtime: 'auto', imageTag: '1.9', image: `${REPO}:custom` },
        dockerInfoFn: mock(() => true),
        gpuDetectFn,
      })
      const result = selectRuntime(input)
      expect(result.mode).toBe('docker')
      expect(result.imageRef).toBe(`${REPO}:custom`)
      expect(gpuDetectFn).not.toHaveBeenCalled()
    })
  })

  describe('spawnFn / findBinary wiring', () => {
    it('native mode: spawnFn is Bun.spawn-like and findBinary returns the native path', () => {
      const input = baseInput({ config: { runtime: 'native', imageTag: '1.9', image: undefined } })
      const result = selectRuntime(input)
      expect(typeof result.spawnFn).toBe('function')
      expect(result.findBinary()).toBe(NATIVE_BINARY)
    })

    it('docker mode: findBinary returns "docker" sentinel', () => {
      const input = baseInput({
        config: { runtime: 'docker', imageTag: '1.9', image: undefined },
        dockerInfoFn: mock(() => true),
      })
      const result = selectRuntime(input)
      expect(result.findBinary()).toBe('docker')
    })
  })
})
