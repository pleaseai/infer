import type { Hono } from 'hono'
import type { Backends } from '../backends'
import type { Registry } from '../registry'
import {
  openAIEmbeddingsRequestSchema,
  openAIToTeiEmbed,
  teiToOpenAIEmbeddings,
} from '../translators/embeddings'
import { parseOrThrow, readJson, resolveTeiBaseUrl } from './_shared'

export type { Backends, TeiBackend } from '../backends'

export function mountEmbeddingsRoutes(app: Hono, registry: Registry, backends: Backends): void {
  app.post('/v1/embeddings', async (c) => {
    const raw = await readJson(c.req.raw)
    const req = parseOrThrow(openAIEmbeddingsRequestSchema, raw)
    const entry = registry.requireType(req.model, 'embedding')

    const baseUrl = await resolveTeiBaseUrl(entry, backends.tei, 'embedding')
    const vectors = await backends.tei.embed(baseUrl, openAIToTeiEmbed(req))

    return c.json(teiToOpenAIEmbeddings(vectors, req))
  })
}
