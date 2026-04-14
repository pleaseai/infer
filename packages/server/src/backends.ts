import type {
  EmbedRequest,
  EmbedResponse,
  RerankRequest,
  RerankResponse,
  TeiProcess,
} from '@infer-please/tei'

export interface TeiBackend {
  ensureRunning: (modelId: string) => Promise<TeiProcess>
  embed: (baseUrl: string, request: EmbedRequest) => Promise<EmbedResponse>
  rerank: (baseUrl: string, request: RerankRequest) => Promise<RerankResponse>
}

export interface Backends {
  tei: TeiBackend
}
