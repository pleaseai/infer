import type {
  EmbedRequest,
  EmbedResponse,
  RerankRequest,
  RerankResponse,
  TeiProcess,
} from '@pleaseai/infer-tei'
import type { Backends } from './routes/embeddings'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { embed, embedMany } from 'ai'
import { describe, expect, it } from 'bun:test'
import OpenAI from 'openai'
import { buildApp } from './app'
import { parseConfig } from './config'

function makeBackends(): Backends {
  // Deterministic mock: return a vector whose first element encodes the
  // input length so tests can verify the request reached the backend.
  return {
    tei: {
      ensureRunning: (modelId): Promise<TeiProcess> =>
        Promise.resolve({ modelId, port: 9000, state: 'ready', subprocess: null, idleTimer: null }),
      embed: (_baseUrl, request: EmbedRequest): Promise<EmbedResponse> => {
        const inputs = Array.isArray(request.inputs) ? request.inputs : [request.inputs]
        return Promise.resolve(inputs.map(s => [s.length, 0, 0]))
      },
      rerank: (_baseUrl, request: RerankRequest): Promise<RerankResponse> => {
        // Score = -index so that results sort in input order; first doc highest.
        return Promise.resolve(request.texts.map((_, index) => ({ index, score: 1 - index * 0.1 })))
      },
    },
  }
}

function makeApp(authToken?: string) {
  const config = parseConfig({
    auth: authToken ? { token: authToken } : undefined,
    models: [
      { id: 'embed-1', type: 'embedding', backend: 'tei', repo_id: 'BAAI/bge-small-en' },
      { id: 'rerank-1', type: 'rerank', backend: 'tei', repo_id: 'BAAI/bge-reranker-base' },
      { id: 'chat-1', type: 'chat', backend: 'llama', repo_id: 'org/chat' },
    ],
  })
  return buildApp({ config, backends: makeBackends() })
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

function makeFetchAdapter(app: ReturnType<typeof makeApp>): FetchLike {
  return async (input, init) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url
    return await app.fetch(new Request(url, init))
  }
}

describe('integration: OpenAI Node SDK', () => {
  it('lists models', async () => {
    const app = makeApp()
    const client = new OpenAI({ apiKey: 'unused', baseURL: 'http://localhost/v1', fetch: makeFetchAdapter(app) })
    const models = await client.models.list()
    expect(models.data.map(m => m.id).sort()).toEqual(['chat-1', 'embed-1', 'rerank-1'])
  })

  it('retrieves a single model', async () => {
    const app = makeApp()
    const client = new OpenAI({ apiKey: 'unused', baseURL: 'http://localhost/v1', fetch: makeFetchAdapter(app) })
    const model = await client.models.retrieve('embed-1')
    expect(model.id).toBe('embed-1')
    expect(model.owned_by).toBe('BAAI')
  })

  it('creates an embedding for a single string', async () => {
    const app = makeApp()
    const client = new OpenAI({ apiKey: 'unused', baseURL: 'http://localhost/v1', fetch: makeFetchAdapter(app) })
    const r = await client.embeddings.create({ model: 'embed-1', input: 'hello' })
    expect(r.data).toHaveLength(1)
    expect(r.data[0]?.embedding).toEqual([5, 0, 0])
    expect(r.model).toBe('embed-1')
    expect(r.usage.prompt_tokens).toBeGreaterThan(0)
  })

  it('creates embeddings for an array of strings', async () => {
    const app = makeApp()
    const client = new OpenAI({ apiKey: 'unused', baseURL: 'http://localhost/v1', fetch: makeFetchAdapter(app) })
    const r = await client.embeddings.create({ model: 'embed-1', input: ['hi', 'hello'] })
    expect(r.data).toHaveLength(2)
    expect(r.data[1]?.embedding).toEqual([5, 0, 0])
  })

  it('returns 501 for chat.completions', async () => {
    const app = makeApp()
    const client = new OpenAI({
      apiKey: 'unused',
      baseURL: 'http://localhost/v1',
      fetch: makeFetchAdapter(app),
      maxRetries: 0,
    })
    let caught: { status?: number } | undefined
    try {
      await client.chat.completions.create({ model: 'chat-1', messages: [{ role: 'user', content: 'hi' }] })
    }
    catch (err) {
      caught = err as { status?: number }
    }
    expect(caught?.status).toBe(501)
  })

  it('enforces auth when configured', async () => {
    const app = makeApp('s3cret')

    const noAuthClient = new OpenAI({
      apiKey: 'unused',
      baseURL: 'http://localhost/v1',
      fetch: makeFetchAdapter(app),
      maxRetries: 0,
    })
    let unauthErr: { status?: number } | undefined
    try {
      await noAuthClient.embeddings.create({ model: 'embed-1', input: 'x' })
    }
    catch (err) {
      unauthErr = err as { status?: number }
    }
    expect(unauthErr?.status).toBe(401)

    const okClient = new OpenAI({
      apiKey: 's3cret',
      baseURL: 'http://localhost/v1',
      fetch: makeFetchAdapter(app),
    })
    const r = await okClient.embeddings.create({ model: 'embed-1', input: 'x' })
    expect(r.data).toHaveLength(1)
  })
})

describe('integration: @ai-sdk/openai-compatible', () => {
  it('embed() returns a single embedding', async () => {
    const app = makeApp()
    const provider = createOpenAICompatible({
      name: 'infer-please',
      apiKey: 'unused',
      baseURL: 'http://localhost/v1',
      fetch: makeFetchAdapter(app) as typeof fetch,
    })
    const result = await embed({ model: provider.textEmbeddingModel('embed-1'), value: 'hello' })
    expect(result.embedding).toEqual([5, 0, 0])
  })

  it('embedMany() returns parallel embeddings', async () => {
    const app = makeApp()
    const provider = createOpenAICompatible({
      name: 'infer-please',
      apiKey: 'unused',
      baseURL: 'http://localhost/v1',
      fetch: makeFetchAdapter(app) as typeof fetch,
    })
    const result = await embedMany({ model: provider.textEmbeddingModel('embed-1'), values: ['a', 'bb'] })
    expect(result.embeddings).toHaveLength(2)
    expect(result.embeddings[0]?.[0]).toBe(1)
    expect(result.embeddings[1]?.[0]).toBe(2)
  })
})

describe('integration: rerank (raw fetch)', () => {
  it('returns Cohere-format response sorted desc', async () => {
    const app = makeApp()
    const fetcher = makeFetchAdapter(app)
    const res = await fetcher('http://localhost/v1/rerank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'rerank-1',
        query: 'q',
        documents: ['a', 'b', 'c'],
        return_documents: true,
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as {
      results: Array<{ index: number, relevance_score: number, document: { text: string } }>
      model: string
    }
    expect(body.results[0]?.index).toBe(0)
    expect(body.results[0]?.document.text).toBe('a')
    expect(body.results.map(r => r.relevance_score)).toEqual([1, 0.9, 0.8])
  })
})
