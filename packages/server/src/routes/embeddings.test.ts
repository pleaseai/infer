import type { EmbedRequest, EmbedResponse, TeiProcess } from '@infer-please/tei'
import type { ModelEntry } from '../config'
import type { Backends } from './embeddings'
import { describe, expect, it } from 'bun:test'
import { createRegistry } from '../registry'
import { createApp } from '../server'
import { mountEmbeddingsRoutes } from './embeddings'

const E1: ModelEntry = { id: 'embed-1', type: 'embedding', backend: 'tei', repo_id: 'BAAI/bge-small-en' }
const R1: ModelEntry = { id: 'rerank-1', type: 'rerank', backend: 'tei', repo_id: 'BAAI/bge-reranker-base' }

interface MockBackends {
  backends: Backends
  ensureCalls: string[]
  embedCalls: Array<{ baseUrl: string, request: EmbedRequest }>
}

function mockBackends(vectors: EmbedResponse): MockBackends {
  const ensureCalls: string[] = []
  const embedCalls: Array<{ baseUrl: string, request: EmbedRequest }> = []
  return {
    ensureCalls,
    embedCalls,
    backends: {
      tei: {
        async ensureRunning(modelId) {
          ensureCalls.push(modelId)
          return { modelId, port: 9000, state: 'ready', subprocess: null, idleTimer: null } satisfies TeiProcess
        },
        embed(baseUrl, request) {
          embedCalls.push({ baseUrl, request })
          return Promise.resolve(vectors)
        },
      },
    },
  }
}

function buildApp(models: ModelEntry[], mocks: MockBackends) {
  const app = createApp({})
  mountEmbeddingsRoutes(app, createRegistry(models), mocks.backends)
  return app
}

describe('POST /v1/embeddings', () => {
  it('returns OpenAI embedding response for a single string input', async () => {
    const mocks = mockBackends([[0.1, 0.2, 0.3]])
    const app = buildApp([E1], mocks)
    const res = await app.request('/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embed-1', input: 'hello' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { data: Array<{ embedding: number[] }>, model: string }
    expect(body.model).toBe('embed-1')
    expect(body.data[0]?.embedding).toEqual([0.1, 0.2, 0.3])
    expect(mocks.ensureCalls).toEqual(['embed-1'])
    expect(mocks.embedCalls[0]?.baseUrl).toBe('http://127.0.0.1:9000')
    expect(mocks.embedCalls[0]?.request).toEqual({ inputs: 'hello' })
  })

  it('returns multiple embeddings for an array input', async () => {
    const mocks = mockBackends([[1, 2], [3, 4]])
    const app = buildApp([E1], mocks)
    const res = await app.request('/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embed-1', input: ['a', 'b'] }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { data: Array<{ index: number, embedding: number[] }> }
    expect(body.data).toHaveLength(2)
    expect(body.data[1]?.index).toBe(1)
  })

  it('returns 400 when model is missing', async () => {
    const mocks = mockBackends([])
    const app = buildApp([E1], mocks)
    const res = await app.request('/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'hello' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 when model is not registered', async () => {
    const mocks = mockBackends([])
    const app = buildApp([E1], mocks)
    const res = await app.request('/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'unknown', input: 'x' }),
    })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('model_not_found')
  })

  it('returns 400 when model type is not embedding', async () => {
    const mocks = mockBackends([])
    const app = buildApp([R1], mocks)
    const res = await app.request('/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'rerank-1', input: 'x' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 501 when backend is llama (not implemented for embedding)', async () => {
    const mocks = mockBackends([])
    const llamaEmbed: ModelEntry = { id: 'em-l', type: 'embedding', backend: 'llama', repo_id: 'org/x' }
    const app = buildApp([llamaEmbed], mocks)
    const res = await app.request('/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'em-l', input: 'x' }),
    })
    expect(res.status).toBe(501)
  })
})
