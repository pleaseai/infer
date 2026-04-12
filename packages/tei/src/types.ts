/**
 * State of a TEI (Text Embeddings Inference) process.
 */
export type TeiProcessState
  = | 'starting'
    | 'ready'
    | 'stopping'
    | 'stopped'
    | 'crashed'

/**
 * Tracks a single TEI process instance.
 */
export interface TeiProcess {
  modelId: string
  port: number
  state: TeiProcessState
  subprocess: unknown | null
  idleTimer: ReturnType<typeof setTimeout> | null
}

/**
 * Configuration options for TeiManager.
 */
export interface TeiManagerOptions {
  portRangeStart: number
  portRangeEnd: number
  idleTimeoutMs: number
  healthCheckIntervalMs: number
  healthCheckTimeoutMs: number
}

/**
 * Request body for POST /embed.
 */
export interface EmbedRequest {
  inputs: string | string[]
  normalize?: boolean
  truncate?: boolean
}

/**
 * Response from POST /embed — array of float arrays (one per input).
 */
export type EmbedResponse = number[][]

/**
 * Request body for POST /rerank.
 */
export interface RerankRequest {
  query: string
  texts: string[]
  raw_scores?: boolean
  return_text?: boolean
}

/**
 * Single result item from POST /rerank.
 */
export interface RerankResult {
  index: number
  score: number
  text?: string
}

/**
 * Response from POST /rerank — sorted list of results.
 */
export type RerankResponse = RerankResult[]

/**
 * Options for TeiClient — points to a running TEI instance.
 */
export interface TeiClientOptions {
  baseUrl: string
}
