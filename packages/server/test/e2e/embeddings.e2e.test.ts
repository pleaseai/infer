import type { TestServerHandle } from './helpers'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { E2E_SKIP_REASON, startTestServer, TEST_EMBED_MODEL } from './helpers'

interface OpenAIEmbeddingResponse {
  object: 'list'
  data: Array<{ index: number, embedding: number[] | string, object: 'embedding' }>
  model: string
  usage: { prompt_tokens: number, total_tokens: number }
}

describe.skipIf(E2E_SKIP_REASON !== null)('e2e: /v1/embeddings', () => {
  let handle: TestServerHandle

  beforeAll(async () => {
    handle = await startTestServer()
  })

  afterAll(async () => {
    if (handle) {
      await handle.shutdown()
    }
  })

  async function postEmbed(body: Record<string, unknown>): Promise<{ status: number, body: OpenAIEmbeddingResponse }> {
    const res = await fetch(`${handle.url}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { status: res.status, body: await res.json() as OpenAIEmbeddingResponse }
  }

  it('embeds a single string', async () => {
    const { status, body } = await postEmbed({ model: TEST_EMBED_MODEL, input: 'hello world' })
    expect(status).toBe(200)
    expect(body.model).toBe(TEST_EMBED_MODEL)
    expect(body.data).toHaveLength(1)
    expect(body.data[0]!.index).toBe(0)
    expect(body.data[0]!.object).toBe('embedding')
    const vec = body.data[0]!.embedding as number[]
    expect(Array.isArray(vec)).toBe(true)
    // all-MiniLM-L6-v2 is a 384-dim model
    expect(vec.length).toBe(384)
    expect(vec.every(x => typeof x === 'number' && Number.isFinite(x))).toBe(true)
  }, 180_000)

  it('embeds an array of strings with preserved order', async () => {
    const { status, body } = await postEmbed({
      model: TEST_EMBED_MODEL,
      input: ['first sentence', 'second sentence', 'third sentence'],
    })
    expect(status).toBe(200)
    expect(body.data).toHaveLength(3)
    expect(body.data.map(d => d.index)).toEqual([0, 1, 2])
    for (const d of body.data) {
      expect((d.embedding as number[]).length).toBe(384)
    }
  })

  it('returns a base64-encoded embedding when requested', async () => {
    const { status, body } = await postEmbed({
      model: TEST_EMBED_MODEL,
      input: 'encode me',
      encoding_format: 'base64',
    })
    expect(status).toBe(200)
    expect(typeof body.data[0]!.embedding).toBe('string')
    // base64 of 384 float32s = 384*4 bytes → ceil(1536/3)*4 = 2048 chars
    expect((body.data[0]!.embedding as string).length).toBeGreaterThan(100)
  })

  it('reports prompt_tokens > 0', async () => {
    const { body } = await postEmbed({ model: TEST_EMBED_MODEL, input: 'count my tokens' })
    expect(body.usage.prompt_tokens).toBeGreaterThan(0)
    expect(body.usage.total_tokens).toBeGreaterThanOrEqual(body.usage.prompt_tokens)
  })
})
