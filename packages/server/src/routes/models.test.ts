import type { ModelEntry } from '../config'
import { describe, expect, it } from 'bun:test'
import { createRegistry } from '../registry'
import { createApp } from '../server'
import { mountModelsRoutes } from './models'

const E1: ModelEntry = { id: 'embed-1', type: 'embedding', backend: 'tei', repo_id: 'BAAI/bge-small-en' }
const R1: ModelEntry = { id: 'rerank-1', type: 'rerank', backend: 'tei', repo_id: 'BAAI/bge-reranker-base' }

function buildApp(models: ModelEntry[]) {
  const app = createApp({})
  mountModelsRoutes(app, createRegistry(models))
  return app
}

describe('GET /v1/models', () => {
  it('returns OpenAI list-format with all registered models', async () => {
    const app = buildApp([E1, R1])
    const res = await app.request('/v1/models')
    expect(res.status).toBe(200)
    const body = await res.json() as {
      object: string
      data: Array<{ id: string, object: string, created: number, owned_by: string }>
    }
    expect(body.object).toBe('list')
    expect(body.data).toHaveLength(2)
    expect(body.data[0]?.object).toBe('model')
    expect(body.data[0]?.id).toBe('embed-1')
    expect(typeof body.data[0]?.created).toBe('number')
    expect(body.data[0]?.owned_by).toBe('BAAI')
  })

  it('returns empty list when no models', async () => {
    const app = buildApp([])
    const res = await app.request('/v1/models')
    expect(res.status).toBe(200)
    const body = await res.json() as { data: unknown[] }
    expect(body.data).toEqual([])
  })
})

describe('GET /v1/models/:id', () => {
  it('returns a single model', async () => {
    const app = buildApp([E1])
    const res = await app.request('/v1/models/embed-1')
    expect(res.status).toBe(200)
    const body = await res.json() as { id: string, object: string }
    expect(body.id).toBe('embed-1')
    expect(body.object).toBe('model')
  })

  it('returns 404 with model_not_found code for unknown model', async () => {
    const app = buildApp([E1])
    const res = await app.request('/v1/models/missing')
    expect(res.status).toBe(404)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('model_not_found')
  })

  it('handles model ids containing slashes', async () => {
    const slashed: ModelEntry = { id: 'org/name', type: 'embedding', backend: 'tei', repo_id: 'org/name' }
    const app = buildApp([slashed])
    const res = await app.request('/v1/models/org/name')
    expect(res.status).toBe(200)
    const body = await res.json() as { id: string }
    expect(body.id).toBe('org/name')
  })
})
