import type { EmbeddingModelV1 } from '@ai-sdk/provider'
import type { TeiManager } from '@infer-please/tei'
import { TeiClient } from '@infer-please/tei'

/**
 * Implements the Vercel AI SDK EmbeddingModelV1<string> interface backed by
 * a Text Embeddings Inference (TEI) process managed by TeiManager.
 */
export class InferPleaseEmbeddingModel implements EmbeddingModelV1<string> {
  readonly specificationVersion = 'v1' as const
  readonly provider = 'infer-please'
  readonly modelId: string
  readonly maxEmbeddingsPerCall = undefined
  readonly supportsParallelCalls = true

  private readonly manager: TeiManager
  private readonly clientOverride: TeiClient | undefined

  constructor(modelId: string, manager: TeiManager, clientOverride?: TeiClient) {
    this.modelId = modelId
    this.manager = manager
    this.clientOverride = clientOverride
  }

  async doEmbed(options: {
    values: string[]
    abortSignal?: AbortSignal
    headers?: Record<string, string | undefined>
  }): Promise<{ embeddings: number[][], usage?: { tokens: number } }> {
    const proc = await this.manager.ensureRunning(this.modelId)

    const client
      = this.clientOverride ?? new TeiClient({ baseUrl: `http://localhost:${proc.port}` })

    const embeddings = await client.embed({ inputs: options.values }, options.abortSignal)

    return { embeddings, usage: { tokens: 0 } }
  }
}
