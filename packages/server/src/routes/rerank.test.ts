import type { RerankRequest, RerankResponse, TeiProcess } from '@pleaseai/infer-tei'
import type { ModelEntry } from '../config'
import type { Backends } from './embeddings'
import { describe, expect, it } from 'bun:test'
import { createRegistry } from '../registry'
import { createApp } from '../server'
import { mountRerankRoutes } from './rerank'

const R1: ModelEntry = { id: 'rerank-1', type: 'rerank', backend: 'tei', repo_id: 'BAAI/bge-reranker-base' }
const E1: ModelEntry = { id: 'embed-1', type: 'embedding', backend: 'tei', repo_id: 'BAAI/bge-small-en' }

interface MockState {
  backends: Backends
  rerankCalls: Array<{ baseUrl: string, request: RerankRequest }>
}

function mockBackends(scores: RerankResponse): MockState {
  const rerankCalls: Array<{ baseUrl: string, request: RerankRequest }> = []
  return {
    rerankCalls,
    backends: {
      tei: {
        ensureRunning(modelId): Promise<TeiProcess> {
          return Promise.resolve({
            modelId,
            port: 9000,
            state: 'ready',
            subprocess: null,
            idleTimer: null,
          })
        },
        embed() {
          return Promise.resolve([])
        },
        rerank(baseUrl, request) {
          rerankCalls.push({ baseUrl, request })
          return Promise.resolve(scores)
        },
      },
    },
  }
}

function buildApp(models: ModelEntry[], mocks: MockState) {
  const app = createApp({})
  mountRerankRoutes(app, createRegistry(models), mocks.backends)
  return app
}

describe('POST /v1/rerank', () => {
  it('returns Cohere-format results sorted by relevance_score desc', async () => {
    const mocks = mockBackends([
      { index: 0, score: 0.2 },
      { index: 1, score: 0.9 },
      { index: 2, score: 0.5 },
    ])
    const app = buildApp([R1], mocks)
    const res = await app.request('/v1/rerank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'rerank-1', query: 'q', documents: ['a', 'b', 'c'] }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { results: Array<{ index: number, relevance_score: number }> }
    expect(body.results.map(r => r.index)).toEqual([1, 2, 0])
    expect(mocks.rerankCalls[0]?.request).toEqual({ query: 'q', texts: ['a', 'b', 'c'], return_text: false })
  })

  it('honors top_n', async () => {
    const mocks = mockBackends([
      { index: 0, score: 0.2 },
      { index: 1, score: 0.9 },
    ])
    const app = buildApp([R1], mocks)
    const res = await app.request('/v1/rerank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'rerank-1', query: 'q', documents: ['a', 'b'], top_n: 1 }),
    })
    const body = await res.json() as { results: unknown[] }
    expect(body.results).toHaveLength(1)
  })

  it('returns 400 for missing required fields', async () => {
    const mocks = mockBackends([])
    const app = buildApp([R1], mocks)
    const res = await app.request('/v1/rerank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'rerank-1', query: 'q' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown model', async () => {
    const mocks = mockBackends([])
    const app = buildApp([R1], mocks)
    const res = await app.request('/v1/rerank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'missing', query: 'q', documents: ['a'] }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 400 when model is not of type rerank', async () => {
    const mocks = mockBackends([])
    const app = buildApp([E1], mocks)
    const res = await app.request('/v1/rerank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embed-1', query: 'q', documents: ['a'] }),
    })
    expect(res.status).toBe(400)
  })
})
