import type { TestServerHandle } from './helpers'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { E2E_SKIP_REASON, startTestServer } from './helpers'

describe.skipIf(E2E_SKIP_REASON !== null)('e2e: /v1/chat/completions (501 stub)', () => {
  let handle: TestServerHandle

  beforeAll(async () => {
    handle = await startTestServer({
      models: [
        { id: 'chat-1', type: 'chat', backend: 'llama', repo_id: 'org/chat-model' },
      ],
    })
  })

  afterAll(async () => {
    if (handle) {
      await handle.shutdown()
    }
  })

  it('returns 501 with an OpenAI-format error envelope', async () => {
    const res = await fetch(`${handle.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'chat-1',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })
    expect(res.status).toBe(501)
    const body = await res.json() as { error: { message: string, type: string, code?: string } }
    expect(body.error).toBeDefined()
    expect(body.error.message).toContain('not implemented')
  })
})
