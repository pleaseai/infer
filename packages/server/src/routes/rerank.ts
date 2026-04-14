import type { Hono } from 'hono'
import type { Backends } from '../backends'
import type { Registry } from '../registry'
import {
  cohereRerankRequestSchema,
  cohereToTeiRerank,
  teiToCohereRerank,
} from '../translators/rerank'
import { parseOrThrow, readJson, resolveTeiBaseUrl } from './_shared'

export function mountRerankRoutes(app: Hono, registry: Registry, backends: Backends): void {
  app.post('/v1/rerank', async (c) => {
    const raw = await readJson(c.req.raw)
    const req = parseOrThrow(cohereRerankRequestSchema, raw)
    const entry = registry.requireType(req.model, 'rerank')

    const baseUrl = await resolveTeiBaseUrl(entry, backends.tei, 'rerank')
    const results = await backends.tei.rerank(baseUrl, cohereToTeiRerank(req))

    return c.json(teiToCohereRerank(results, req))
  })
}
