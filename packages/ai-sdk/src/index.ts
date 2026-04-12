import { createTeiManager } from '@infer-please/tei'
import type { TeiManagerOptions } from '@infer-please/tei'
import { InferPleaseEmbeddingModel } from './embedding-model'

export interface InferPleaseProvider {
  textEmbeddingModel(modelId: string): InferPleaseEmbeddingModel
}

export function createInferPlease(options?: Partial<TeiManagerOptions>): InferPleaseProvider {
  const manager = createTeiManager(options)

  return {
    textEmbeddingModel(modelId: string) {
      return new InferPleaseEmbeddingModel(modelId, manager)
    },
  }
}

export { InferPleaseEmbeddingModel } from './embedding-model'
export type { TeiManagerOptions } from '@infer-please/tei'
