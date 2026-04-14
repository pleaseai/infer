import type { MiddlewareHandler } from 'hono'
import { unauthorized } from '../errors'

const BEARER_RE = /^bearer +(\S.*)$/i

export function bearerAuth(expectedToken: string | undefined): MiddlewareHandler {
  return async (c, next) => {
    if (!expectedToken) {
      await next()
      return
    }

    const header = c.req.header('Authorization') ?? c.req.header('authorization')
    if (!header) {
      throw unauthorized()
    }

    const match = BEARER_RE.exec(header)
    if (!match || match[1] !== expectedToken) {
      throw unauthorized()
    }

    await next()
  }
}
