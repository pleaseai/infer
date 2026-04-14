import { describe, expect, it } from 'bun:test'
import { invalidRequest, modelNotFound } from './errors'
import { createApp } from './server'

describe('createApp', () => {
  it('returns 404 OpenAI-format error for unknown route', async () => {
    const app = createApp({})
    const res = await app.request('/v1/missing')
    expect(res.status).toBe(404)
    const body = await res.json() as { error: { type: string } }
    expect(body.error.type).toBe('not_found_error')
  })

  it('serializes ApiError thrown from a handler', async () => {
    const app = createApp({})
    app.get('/boom', () => {
      throw modelNotFound('foo')
    })
    const res = await app.request('/boom')
    expect(res.status).toBe(404)
    const body = await res.json() as { error: { code: string, message: string } }
    expect(body.error.code).toBe('model_not_found')
    expect(body.error.message).toContain('foo')
  })

  it('serializes invalidRequest as 400', async () => {
    const app = createApp({})
    app.get('/bad', () => {
      throw invalidRequest('missing model', 'model')
    })
    const res = await app.request('/bad')
    expect(res.status).toBe(400)
    const body = await res.json() as { error: { param: string } }
    expect(body.error.param).toBe('model')
  })

  it('returns 500 for unknown exceptions', async () => {
    const app = createApp({})
    app.get('/explode', () => {
      throw new Error('unexpected')
    })
    const res = await app.request('/explode')
    expect(res.status).toBe(500)
    const body = await res.json() as { error: { type: string } }
    expect(body.error.type).toBe('api_error')
  })

  it('applies auth middleware when authToken is configured', async () => {
    const app = createApp({ authToken: 'k' })
    app.get('/secure', c => c.json({ ok: true }))

    const noAuth = await app.request('/secure')
    expect(noAuth.status).toBe(401)

    const withAuth = await app.request('/secure', { headers: { Authorization: 'Bearer k' } })
    expect(withAuth.status).toBe(200)
  })
})
