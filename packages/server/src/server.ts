import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { Hono } from 'hono'
import { ApiError, errorBody } from './errors'
import { bearerAuth } from './middleware/auth'

export interface CreateAppOptions {
  authToken?: string
}

export function createApp(options: CreateAppOptions = {}): Hono {
  const app = new Hono()

  app.use('*', bearerAuth(options.authToken))

  app.notFound((c) => {
    return c.json(
      errorBody({
        message: `Route not found: ${c.req.method} ${c.req.path}`,
        type: 'not_found_error',
        code: 'route_not_found',
      }),
      404,
    )
  })

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json(err.body, err.status as ContentfulStatusCode)
    }

    console.error('[server] unhandled error', err)
    return c.json(
      errorBody({ message: 'Internal server error', type: 'api_error' }),
      500,
    )
  })

  return app
}
