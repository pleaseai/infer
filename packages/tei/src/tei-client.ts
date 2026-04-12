import type {
  EmbedRequest,
  EmbedResponse,
  RerankRequest,
  RerankResponse,
  TeiClientOptions,
} from './types'

const TRAILING_SLASH_RE = /\/$/

/**
 * HTTP client for interacting with a running TEI (Text Embeddings Inference) instance.
 */
export class TeiClient {
  private readonly baseUrl: string
  private readonly fetchFn: typeof fetch

  constructor(options: TeiClientOptions, fetchFn: typeof fetch = globalThis.fetch) {
    this.baseUrl = options.baseUrl.replace(TRAILING_SLASH_RE, '')
    this.fetchFn = fetchFn
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    const response = await this.fetchFn(`${this.baseUrl}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`TEI embed request failed with status ${response.status}: ${body}`)
    }

    return response.json() as Promise<EmbedResponse>
  }

  async rerank(request: RerankRequest): Promise<RerankResponse> {
    const response = await this.fetchFn(`${this.baseUrl}/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`TEI rerank request failed with status ${response.status}: ${body}`)
    }

    return response.json() as Promise<RerankResponse>
  }
}
