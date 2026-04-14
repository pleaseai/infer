import { describe, expect, it } from 'bun:test'
import {
  ApiError,
  errorBody,
  invalidRequest,
  modelNotFound,
  notImplemented,
  unauthorized,
} from './errors'

describe('errorBody', () => {
  it('builds an OpenAI-format error envelope', () => {
    const body = errorBody({
      message: 'oops',
      type: 'invalid_request_error',
      code: 'bad_thing',
      param: 'model',
    })
    expect(body).toEqual({
      error: {
        message: 'oops',
        type: 'invalid_request_error',
        code: 'bad_thing',
        param: 'model',
      },
    })
  })

  it('omits param/code when not provided', () => {
    const body = errorBody({ message: 'm', type: 'api_error' })
    expect(body).toEqual({ error: { message: 'm', type: 'api_error', code: null, param: null } })
  })
})

describe('ApiError factories', () => {
  it('invalidRequest is 400', () => {
    const err = invalidRequest('bad input', 'model')
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(400)
    expect(err.body.error.type).toBe('invalid_request_error')
    expect(err.body.error.param).toBe('model')
  })

  it('modelNotFound is 404 with code model_not_found', () => {
    const err = modelNotFound('missing')
    expect(err.status).toBe(404)
    expect(err.body.error.code).toBe('model_not_found')
    expect(err.body.error.message).toContain('missing')
  })

  it('unauthorized is 401', () => {
    const err = unauthorized('bad token')
    expect(err.status).toBe(401)
    expect(err.body.error.type).toBe('authentication_error')
  })

  it('notImplemented is 501', () => {
    const err = notImplemented('chat backend not implemented', 'backend_unavailable')
    expect(err.status).toBe(501)
    expect(err.body.error.type).toBe('not_implemented_error')
    expect(err.body.error.code).toBe('backend_unavailable')
  })
})

describe('ApiError', () => {
  it('exposes status and body for HTTP serialization', () => {
    const err = new ApiError(429, { message: 'slow down', type: 'rate_limit_error' })
    expect(err.status).toBe(429)
    expect(err.body.error.type).toBe('rate_limit_error')
  })

  it('is throwable as a regular Error', () => {
    expect(() => {
      throw new ApiError(500, { message: 'boom', type: 'api_error' })
    }).toThrow(/boom/)
  })
})
