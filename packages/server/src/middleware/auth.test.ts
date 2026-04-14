import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { ApiError } from '../errors'
import { bearerAuth } from './auth'

function appWithAuth(token: string | undefined): Hono {
  const app = new Hono()
  app.use('*', bearerAuth(token))
  app.get('/ping', c => c.json({ ok: true }))
  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json(err.body, err.status as 401 | 500)
    }
    return c.json({ error: { message: 'fail', type: 'api_error', code: null, param: null } }, 500)
  })
  return app
}

describe('bearerAuth', () => {
  it('passes through when no token is configured', async () => {
    const app = appWithAuth(undefined)
    const res = await app.request('/ping')
    expect(res.status).toBe(200)
  })

  it('returns 401 when token configured and Authorization header missing', async () => {
    const app = appWithAuth('s3cret')
    const res = await app.request('/ping')
    expect(res.status).toBe(401)
    const body = await res.json() as { error: { type: string } }
    expect(body.error.type).toBe('authentication_error')
  })

  it('returns 401 when Bearer token mismatches', async () => {
    const app = appWithAuth('s3cret')
    const res = await app.request('/ping', { headers: { Authorization: 'Bearer wrong' } })
    expect(res.status).toBe(401)
  })

  it('returns 401 when scheme is not Bearer', async () => {
    const app = appWithAuth('s3cret')
    const res = await app.request('/ping', { headers: { Authorization: 'Basic s3cret' } })
    expect(res.status).toBe(401)
  })

  it('passes when Bearer token matches', async () => {
    const app = appWithAuth('s3cret')
    const res = await app.request('/ping', { headers: { Authorization: 'Bearer s3cret' } })
    expect(res.status).toBe(200)
  })

  it('is case-insensitive on the Bearer scheme keyword', async () => {
    const app = appWithAuth('s3cret')
    const res = await app.request('/ping', { headers: { Authorization: 'bearer s3cret' } })
    expect(res.status).toBe(200)
  })
})
