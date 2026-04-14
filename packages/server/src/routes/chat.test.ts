import { describe, expect, it } from 'bun:test'
import { createApp } from '../server'
import { mountChatRoutes } from './chat'

function buildApp() {
  const app = createApp({})
  mountChatRoutes(app)
  return app
}

describe('POST /v1/chat/completions', () => {
  it('returns 501 with OpenAI-format error body', async () => {
    const app = buildApp()
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'whatever', messages: [{ role: 'user', content: 'hi' }] }),
    })
    expect(res.status).toBe(501)
    const body = await res.json() as { error: { type: string, code: string, message: string } }
    expect(body.error.type).toBe('not_implemented_error')
    expect(body.error.code).toBe('backend_unavailable')
    expect(body.error.message).toMatch(/chat/i)
  })

  it('returns 501 even for malformed bodies (no body inspection)', async () => {
    const app = buildApp()
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })
    expect(res.status).toBe(501)
  })
})
