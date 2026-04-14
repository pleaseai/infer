import type { Hono } from 'hono'
import { notImplemented } from '../errors'

export function mountChatRoutes(app: Hono): void {
  app.post('/v1/chat/completions', () => {
    throw notImplemented('chat backend not implemented', 'backend_unavailable')
  })
}
