import type {
  EmbedRequest,
  EmbedResponse,
  RerankRequest,
  RerankResponse,
  TeiProcess,
} from '@infer-please/tei'
import type { Hono } from 'hono'
import type { Registry } from '../registry'
import { invalidRequest, notImplemented } from '../errors'
import {
  openAIEmbeddingsRequestSchema,
  openAIToTeiEmbed,
  teiToOpenAIEmbeddings,
} from '../translators/embeddings'

export interface TeiBackend {
  ensureRunning: (modelId: string) => Promise<TeiProcess>
  embed: (baseUrl: string, request: EmbedRequest) => Promise<EmbedResponse>
  rerank: (baseUrl: string, request: RerankRequest) => Promise<RerankResponse>
}

export interface Backends {
  tei: TeiBackend
}

export function mountEmbeddingsRoutes(app: Hono, registry: Registry, backends: Backends): void {
  app.post('/v1/embeddings', async (c) => {
    const raw = await readJson(c.req.raw)
    const parsed = openAIEmbeddingsRequestSchema.safeParse(raw)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      throw invalidRequest(first?.message ?? 'Invalid request', String(first?.path?.[0] ?? ''))
    }
    const req = parsed.data

    const entry = registry.requireType(req.model, 'embedding')

    if (entry.backend !== 'tei') {
      throw notImplemented(
        `Embedding backend '${entry.backend}' is not implemented`,
        'backend_unavailable',
      )
    }

    const proc = await backends.tei.ensureRunning(req.model)
    const baseUrl = `http://127.0.0.1:${proc.port}`
    const vectors = await backends.tei.embed(baseUrl, openAIToTeiEmbed(req))

    return c.json(teiToOpenAIEmbeddings(vectors, req))
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
