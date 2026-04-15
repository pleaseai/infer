import type { TestServerHandle } from './helpers'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { E2E_SKIP_REASON, startTestServer, TEST_RERANK_MODEL } from './helpers'

interface CohereRerankResponse {
  results: Array<{
    index: number
    relevance_score: number
    document?: { text: string }
  }>
  model: string
}

describe.skipIf(E2E_SKIP_REASON !== null)('e2e: /v1/rerank', () => {
  let handle: TestServerHandle

  beforeAll(async () => {
    handle = await startTestServer({
      models: [
        { id: TEST_RERANK_MODEL, type: 'rerank', backend: 'tei', repo_id: TEST_RERANK_MODEL },
      ],
    })
  })

  afterAll(async () => {
    if (handle) {
      await handle.shutdown()
    }
  })

  it('returns documents sorted by relevance_score desc', async () => {
    const res = await fetch(`${handle.url}/v1/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: TEST_RERANK_MODEL,
        query: 'what is the capital of France?',
        documents: [
          'Bananas are yellow.',
          'Paris is the capital and largest city of France.',
          'The Eiffel Tower is in Paris.',
        ],
        return_documents: true,
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as CohereRerankResponse
    expect(body.results.length).toBe(3)

    // Sorted desc by relevance_score
    const scores = body.results.map(r => r.relevance_score)
    for (let i = 0; i < scores.length - 1; i++) {
      expect(scores[i]!).toBeGreaterThanOrEqual(scores[i + 1]!)
    }

    // The Paris sentence should be the most relevant
    expect(body.results[0]!.index).toBe(1)
    expect(body.results[0]!.document?.text).toContain('Paris')
  }, 180_000)

  it('omits document text when return_documents is false', async () => {
    const res = await fetch(`${handle.url}/v1/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: TEST_RERANK_MODEL,
        query: 'capital of France',
        documents: ['Paris', 'Berlin'],
        return_documents: false,
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as CohereRerankResponse
    expect(body.results[0]!.document).toBeUndefined()
  })
})
