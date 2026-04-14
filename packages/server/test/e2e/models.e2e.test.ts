import type { TestServerHandle } from './helpers'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { E2E_SKIP_REASON, startTestServer, TEST_EMBED_MODEL, TEST_RERANK_MODEL } from './helpers'

describe.skipIf(E2E_SKIP_REASON !== null)('e2e: /v1/models', () => {
  let handle: TestServerHandle

  beforeAll(async () => {
    handle = await startTestServer({
      models: [
        { id: TEST_EMBED_MODEL, type: 'embedding', backend: 'tei', repo_id: TEST_EMBED_MODEL },
        { id: TEST_RERANK_MODEL, type: 'rerank', backend: 'tei', repo_id: TEST_RERANK_MODEL },
      ],
    })
  })

  afterAll(async () => {
    if (handle) {
      await handle.shutdown()
    }
  })

  it('lists registered models', async () => {
    const res = await fetch(`${handle.url}/v1/models`)
    expect(res.status).toBe(200)
    const body = await res.json() as { object: string, data: Array<{ id: string, object: string }> }
    expect(body.object).toBe('list')
    const ids = body.data.map(m => m.id).sort()
    expect(ids).toEqual([TEST_EMBED_MODEL, TEST_RERANK_MODEL].sort())
    for (const m of body.data) {
      expect(m.object).toBe('model')
    }
  })

  it('retrieves a single model by id (including slash-bearing ids)', async () => {
    const res = await fetch(`${handle.url}/v1/models/${TEST_EMBED_MODEL}`)
    expect(res.status).toBe(200)
    const body = await res.json() as { id: string, owned_by: string }
    expect(body.id).toBe(TEST_EMBED_MODEL)
    // sentence-transformers/all-MiniLM-L6-v2 → owned_by = sentence-transformers
    expect(body.owned_by).toBe('sentence-transformers')
  })

  it('returns 404 for unknown model', async () => {
    const res = await fetch(`${handle.url}/v1/models/does-not-exist`)
    expect(res.status).toBe(404)
    const body = await res.json() as { error: { type: string } }
    expect(body.error.type).toBeDefined()
  })
})
