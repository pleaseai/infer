import { describe, expect, it } from 'bun:test'
import { resolveTeiImage } from './image-resolver'

const REPO = 'ghcr.io/huggingface/text-embeddings-inference'

describe('resolveTeiImage', () => {
  describe('override precedence', () => {
    it('returns override verbatim when tei.image is set (digest)', () => {
      const result = resolveTeiImage({
        gpu: { computeCap: '8.9', count: 1 },
        arch: 'linux-x64',
        imageTag: '1.9',
        override: `${REPO}@sha256:abc123`,
      })
      expect(result.ref).toBe(`${REPO}@sha256:abc123`)
      expect(result.isExperimental).toBe(false)
      expect(result.reason).toMatch(/override/i)
    })

    it('returns override verbatim even when no GPU is present', () => {
      const result = resolveTeiImage({
        gpu: null,
        arch: 'darwin-arm64',
        imageTag: '1.9',
        override: `${REPO}:custom-tag`,
      })
      expect(result.ref).toBe(`${REPO}:custom-tag`)
    })
  })

  describe('GPU compute capability mapping (imageTag: 1.9)', () => {
    const cases: Array<[string, string, boolean]> = [
      ['7.5', `${REPO}:turing-1.9`, true],
      ['8.0', `${REPO}:1.9`, false],
      ['8.6', `${REPO}:86-1.9`, false],
      ['8.9', `${REPO}:89-1.9`, false],
      ['9.0', `${REPO}:hopper-1.9`, false],
      ['10.0', `${REPO}:100-1.9`, true],
      ['12.0', `${REPO}:120-1.9`, true],
      ['12.1', `${REPO}:121-1.9`, true],
    ]

    for (const [cap, ref, experimental] of cases) {
      it(`compute cap ${cap} → ${ref} (experimental=${experimental})`, () => {
        const result = resolveTeiImage({
          gpu: { computeCap: cap, count: 1 },
          arch: 'linux-x64',
          imageTag: '1.9',
          override: undefined,
        })
        expect(result.ref).toBe(ref)
        expect(result.isExperimental).toBe(experimental)
      })
    }
  })

  describe('unsupported / Volta fallback', () => {
    it('compute cap 7.0 (Volta) falls back to cpu variant with reason', () => {
      const result = resolveTeiImage({
        gpu: { computeCap: '7.0', count: 1 },
        arch: 'linux-x64',
        imageTag: '1.9',
        override: undefined,
      })
      expect(result.ref).toBe(`${REPO}:cpu-1.9`)
      expect(result.reason).toMatch(/volta|unsupported|7\.0/i)
    })

    it('unknown compute cap falls back to cpu with reason', () => {
      const result = resolveTeiImage({
        gpu: { computeCap: '99.9', count: 1 },
        arch: 'linux-x64',
        imageTag: '1.9',
        override: undefined,
      })
      expect(result.ref).toBe(`${REPO}:cpu-1.9`)
      expect(result.reason).toMatch(/unsupported|unknown/i)
    })
  })

  describe('arch-based CPU fallback when no GPU', () => {
    it('linux-x64 + no GPU → cpu-1.9', () => {
      const result = resolveTeiImage({
        gpu: null,
        arch: 'linux-x64',
        imageTag: '1.9',
        override: undefined,
      })
      expect(result.ref).toBe(`${REPO}:cpu-1.9`)
      expect(result.isExperimental).toBe(false)
    })

    it('darwin-arm64 + no GPU → cpu-arm64-1.9', () => {
      const result = resolveTeiImage({
        gpu: null,
        arch: 'darwin-arm64',
        imageTag: '1.9',
        override: undefined,
      })
      expect(result.ref).toBe(`${REPO}:cpu-arm64-1.9`)
    })

    it('linux-arm64 + no GPU → cpu-arm64-1.9', () => {
      const result = resolveTeiImage({
        gpu: null,
        arch: 'linux-arm64',
        imageTag: '1.9',
        override: undefined,
      })
      expect(result.ref).toBe(`${REPO}:cpu-arm64-1.9`)
    })

    it('unknown arch (e.g. windows) + no GPU → cpu-1.9 (x64 fallback)', () => {
      const result = resolveTeiImage({
        gpu: null,
        arch: 'unknown',
        imageTag: '1.9',
        override: undefined,
      })
      expect(result.ref).toBe(`${REPO}:cpu-1.9`)
    })

    it('darwin-x64 (Intel Mac) + no GPU → cpu-1.9', () => {
      const result = resolveTeiImage({
        gpu: null,
        arch: 'darwin-x64',
        imageTag: '1.9',
        override: undefined,
      })
      expect(result.ref).toBe(`${REPO}:cpu-1.9`)
    })
  })

  describe('imageTag override', () => {
    it('respects custom imageTag for GPU variant', () => {
      const result = resolveTeiImage({
        gpu: { computeCap: '8.9', count: 1 },
        arch: 'linux-x64',
        imageTag: '1.8',
        override: undefined,
      })
      expect(result.ref).toBe(`${REPO}:89-1.8`)
    })

    it('respects custom imageTag for CPU variant', () => {
      const result = resolveTeiImage({
        gpu: null,
        arch: 'linux-x64',
        imageTag: '2.0',
        override: undefined,
      })
      expect(result.ref).toBe(`${REPO}:cpu-2.0`)
    })
  })

  describe('reason field', () => {
    it('includes compute cap for GPU variants', () => {
      const result = resolveTeiImage({
        gpu: { computeCap: '8.9', count: 1 },
        arch: 'linux-x64',
        imageTag: '1.9',
        override: undefined,
      })
      expect(result.reason).toMatch(/8\.9/)
    })

    it('includes arch for CPU fallback', () => {
      const result = resolveTeiImage({
        gpu: null,
        arch: 'darwin-arm64',
        imageTag: '1.9',
        override: undefined,
      })
      expect(result.reason).toMatch(/darwin-arm64|no gpu/i)
    })
  })
})
