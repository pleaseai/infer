import { describe, expect, it } from 'bun:test'
import { configSchema, loadConfigFromString, parseConfig } from './config'

describe('configSchema', () => {
  it('accepts a minimal valid config', () => {
    const result = configSchema.safeParse({
      models: [{ id: 'foo', type: 'embedding', backend: 'tei', repo_id: 'BAAI/bge-small-en' }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.server.port).toBe(3141)
      expect(result.data.server.host).toBe('127.0.0.1')
      expect(result.data.auth).toBeUndefined()
    }
  })

  it('applies defaults for server.port and server.host', () => {
    const result = configSchema.parse({ models: [] })
    expect(result.server.port).toBe(3141)
    expect(result.server.host).toBe('127.0.0.1')
  })

  it('rejects invalid model type', () => {
    const result = configSchema.safeParse({
      models: [{ id: 'x', type: 'unknown', backend: 'tei', repo_id: 'r' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid backend', () => {
    const result = configSchema.safeParse({
      models: [{ id: 'x', type: 'embedding', backend: 'mystery', repo_id: 'r' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects duplicate model ids', () => {
    const result = configSchema.safeParse({
      models: [
        { id: 'dup', type: 'embedding', backend: 'tei', repo_id: 'a' },
        { id: 'dup', type: 'rerank', backend: 'tei', repo_id: 'b' },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('accepts auth.token when provided', () => {
    const result = configSchema.parse({
      auth: { token: 'secret' },
      models: [],
    })
    expect(result.auth?.token).toBe('secret')
  })

  it('rejects empty auth.token string', () => {
    const result = configSchema.safeParse({
      auth: { token: '' },
      models: [],
    })
    expect(result.success).toBe(false)
  })

  describe('tei section', () => {
    it('applies defaults when tei section is absent', () => {
      const cfg = configSchema.parse({ models: [] })
      expect(cfg.tei.runtime).toBe('auto')
      expect(cfg.tei.imageTag).toBe('1.9')
      expect(cfg.tei.image).toBeUndefined()
    })

    it('accepts runtime: native', () => {
      const cfg = configSchema.parse({ tei: { runtime: 'native' }, models: [] })
      expect(cfg.tei.runtime).toBe('native')
    })

    it('accepts runtime: docker', () => {
      const cfg = configSchema.parse({ tei: { runtime: 'docker' }, models: [] })
      expect(cfg.tei.runtime).toBe('docker')
    })

    it('accepts runtime: auto', () => {
      const cfg = configSchema.parse({ tei: { runtime: 'auto' }, models: [] })
      expect(cfg.tei.runtime).toBe('auto')
    })

    it('rejects unknown runtime values', () => {
      const result = configSchema.safeParse({ tei: { runtime: 'wasm' }, models: [] })
      expect(result.success).toBe(false)
    })

    it('accepts tei.image full reference override', () => {
      const cfg = configSchema.parse({
        tei: { image: 'ghcr.io/huggingface/text-embeddings-inference@sha256:abc' },
        models: [],
      })
      expect(cfg.tei.image).toBe('ghcr.io/huggingface/text-embeddings-inference@sha256:abc')
    })

    it('accepts tei.imageTag override', () => {
      const cfg = configSchema.parse({ tei: { imageTag: '1.8' }, models: [] })
      expect(cfg.tei.imageTag).toBe('1.8')
    })

    it('rejects empty tei.image string', () => {
      const result = configSchema.safeParse({ tei: { image: '' }, models: [] })
      expect(result.success).toBe(false)
    })

    it('rejects empty tei.imageTag string', () => {
      const result = configSchema.safeParse({ tei: { imageTag: '' }, models: [] })
      expect(result.success).toBe(false)
    })
  })
})

describe('parseConfig', () => {
  it('returns parsed config from plain object', () => {
    const cfg = parseConfig({ models: [{ id: 'm', type: 'rerank', backend: 'tei', repo_id: 'r' }] })
    expect(cfg.models).toHaveLength(1)
    expect(cfg.models[0]?.id).toBe('m')
  })

  it('throws ConfigValidationError with details on invalid input', () => {
    expect(() => parseConfig({ models: [{ id: 'x' }] })).toThrow(/models/)
  })
})

describe('loadConfigFromString', () => {
  it('parses YAML text', () => {
    const yaml = `
server:
  port: 4242
models:
  - id: bge-small
    type: embedding
    backend: tei
    repo_id: BAAI/bge-small-en
`
    const cfg = loadConfigFromString(yaml)
    expect(cfg.server.port).toBe(4242)
    expect(cfg.models[0]?.id).toBe('bge-small')
  })

  it('throws on malformed YAML', () => {
    expect(() => loadConfigFromString('::not valid yaml::\n  - [')).toThrow()
  })

  it('throws on schema violation', () => {
    expect(() => loadConfigFromString('models: [{ id: x }]')).toThrow()
  })
})
