import type { Hono } from 'hono'
import type { Registry } from '../registry'
import type { Backends } from './embeddings'
import { invalidRequest, notImplemented } from '../errors'
import {
  cohereRerankRequestSchema,
  cohereToTeiRerank,
  teiToCohereRerank,
} from '../translators/rerank'

export function mountRerankRoutes(app: Hono, registry: Registry, backends: Backends): void {
  app.post('/v1/rerank', async (c) => {
    const raw = await readJson(c.req.raw)
    const parsed = cohereRerankRequestSchema.safeParse(raw)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      throw invalidRequest(first?.message ?? 'Invalid request', String(first?.path?.[0] ?? ''))
    }
    const req = parsed.data

    const entry = registry.requireType(req.model, 'rerank')

    if (entry.backend !== 'tei') {
      throw notImplemented(
        `Rerank backend '${entry.backend}' is not implemented`,
        'backend_unavailable',
      )
    }

    const proc = await backends.tei.ensureRunning(req.model)
    const baseUrl = `http://127.0.0.1:${proc.port}`
    const results = await backends.tei.rerank(baseUrl, cohereToTeiRerank(req))

    return c.json(teiToCohereRerank(results, req))
  })
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  }
  catch {
    throw invalidRequest('Request body must be valid JSON')
  }
}
