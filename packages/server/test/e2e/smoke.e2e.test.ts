import type { TestServerHandle } from './helpers'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { E2E_SKIP_REASON, startTestServer, TEST_EMBED_MODEL } from './helpers'

describe.skipIf(E2E_SKIP_REASON !== null)('e2e smoke: real TEI via Docker', () => {
  let handle: TestServerHandle

  beforeAll(async () => {
    handle = await startTestServer()
  })

  afterAll(async () => {
    if (handle) {
      await handle.shutdown()
    }
  })

  it('produces a non-empty embedding vector', async () => {
    const res = await fetch(`${handle.url}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: TEST_EMBED_MODEL, input: 'hello world' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as {
      data: Array<{ embedding: number[] }>
      model: string
    }
    expect(body.model).toBe(TEST_EMBED_MODEL)
    expect(body.data).toHaveLength(1)
    const vec = body.data[0]!.embedding
    expect(vec.length).toBeGreaterThan(0)
    expect(vec.some(x => x !== 0)).toBe(true)
  }, 180_000)
})
