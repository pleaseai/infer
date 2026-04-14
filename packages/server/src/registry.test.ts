import type { ModelEntry } from './config'
import { describe, expect, it } from 'bun:test'
import { createRegistry } from './registry'

const E1: ModelEntry = { id: 'embed-1', type: 'embedding', backend: 'tei', repo_id: 'BAAI/bge-small-en' }
const R1: ModelEntry = { id: 'rerank-1', type: 'rerank', backend: 'tei', repo_id: 'BAAI/bge-reranker-base' }
const C1: ModelEntry = { id: 'chat-1', type: 'chat', backend: 'llama', repo_id: 'Meta/llama-3' }

describe('Registry.list', () => {
  it('returns all registered models', () => {
    const reg = createRegistry([E1, R1, C1])
    expect(reg.list()).toHaveLength(3)
    expect(reg.list().map(m => m.id)).toEqual(['embed-1', 'rerank-1', 'chat-1'])
  })

  it('returns empty array when no models registered', () => {
    const reg = createRegistry([])
    expect(reg.list()).toEqual([])
  })
})

describe('Registry.get', () => {
  it('returns the entry for a known id', () => {
    const reg = createRegistry([E1])
    expect(reg.get('embed-1')).toEqual(E1)
  })

  it('returns undefined for unknown id', () => {
    const reg = createRegistry([E1])
    expect(reg.get('missing')).toBeUndefined()
  })
})

describe('Registry.requireType', () => {
  it('returns the model when type matches', () => {
    const reg = createRegistry([E1, R1])
    const m = reg.requireType('embed-1', 'embedding')
    expect(m.id).toBe('embed-1')
  })

  it('throws modelNotFound (404) when id is missing', () => {
    const reg = createRegistry([E1])
    expect(() => reg.requireType('missing', 'embedding')).toThrow(/missing/)
  })

  it('throws invalidRequest (400) when type does not match', () => {
    const reg = createRegistry([E1])
    expect(() => reg.requireType('embed-1', 'rerank')).toThrow(/rerank/)
  })
})
