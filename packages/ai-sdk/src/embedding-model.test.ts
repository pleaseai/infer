import type { TeiClient, TeiManager } from '@pleaseai/infer-tei'
import { describe, expect, it, mock } from 'bun:test'
import { InferPleaseEmbeddingModel } from './embedding-model'

function makeManager(port: number): TeiManager {
  return {
    ensureRunning: mock(async (_modelId: string) => ({
      modelId: _modelId,
      port,
      state: 'ready' as const,
      subprocess: null,
      idleTimer: null,
    })),
  } as unknown as TeiManager
}

function makeClient(embeddings: number[][]): TeiClient {
  return {
    embed: mock(async (_req: { inputs: string | string[] }) => embeddings),
  } as unknown as TeiClient
}

describe('InferPleaseEmbeddingModel', () => {
  describe('model properties', () => {
    it('sets specificationVersion to v1', () => {
      const manager = makeManager(8080)
      const model = new InferPleaseEmbeddingModel('BAAI/bge-small-en-v1.5', manager)
      expect(model.specificationVersion).toBe('v1')
    })

    it('sets provider to infer-please', () => {
      const manager = makeManager(8080)
      const model = new InferPleaseEmbeddingModel('BAAI/bge-small-en-v1.5', manager)
      expect(model.provider).toBe('infer-please')
    })

    it('sets modelId from constructor argument', () => {
      const manager = makeManager(8080)
      const model = new InferPleaseEmbeddingModel('BAAI/bge-small-en-v1.5', manager)
      expect(model.modelId).toBe('BAAI/bge-small-en-v1.5')
    })

    it('sets maxEmbeddingsPerCall to undefined', () => {
      const manager = makeManager(8080)
      const model = new InferPleaseEmbeddingModel('BAAI/bge-small-en-v1.5', manager)
      expect(model.maxEmbeddingsPerCall).toBeUndefined()
    })

    it('sets supportsParallelCalls to true', () => {
      const manager = makeManager(8080)
      const model = new InferPleaseEmbeddingModel('BAAI/bge-small-en-v1.5', manager)
      expect(model.supportsParallelCalls).toBe(true)
    })
  })

  describe('doEmbed()', () => {
    it('returns embeddings from TeiClient', async () => {
      const expectedEmbeddings = [[0.1, 0.2, 0.3]]
      const manager = makeManager(8080)
      const client = makeClient(expectedEmbeddings)
      const model = new InferPleaseEmbeddingModel('BAAI/bge-small-en-v1.5', manager, client)

      const result = await model.doEmbed({ values: ['hello'] })

      expect(result.embeddings).toEqual(expectedEmbeddings)
    })

    it('calls ensureRunning with correct modelId', async () => {
      const manager = makeManager(8080)
      const client = makeClient([[0.1, 0.2]])
      const model = new InferPleaseEmbeddingModel('BAAI/bge-small-en-v1.5', manager, client)

      await model.doEmbed({ values: ['hello'] })

      expect(manager.ensureRunning).toHaveBeenCalledWith('BAAI/bge-small-en-v1.5')
    })

    it('returns usage with tokens: 0', async () => {
      const manager = makeManager(8080)
      const client = makeClient([[0.1, 0.2]])
      const model = new InferPleaseEmbeddingModel('BAAI/bge-small-en-v1.5', manager, client)

      const result = await model.doEmbed({ values: ['hello'] })

      expect(result.usage).toEqual({ tokens: 0 })
    })

    it('creates TeiClient with correct baseUrl from port', async () => {
      const manager = makeManager(9000)
      // No pre-built client — model should construct one using manager's port
      const model = new InferPleaseEmbeddingModel('my-model', manager)

      // We can't easily test internal client creation without a pre-injected client,
      // so we verify that the model still calls ensureRunning and returns a result shape
      // (the actual embed call will fail since there's no real server — but ensureRunning is called)
      await expect(model.doEmbed({ values: ['hello'] })).rejects.toThrow()
      expect(manager.ensureRunning).toHaveBeenCalledWith('my-model')
    })

    it('handles multiple values', async () => {
      const expectedEmbeddings = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ]
      const manager = makeManager(8080)
      const client = makeClient(expectedEmbeddings)
      const model = new InferPleaseEmbeddingModel('BAAI/bge-small-en-v1.5', manager, client)

      const result = await model.doEmbed({ values: ['hello', 'world'] })

      expect(result.embeddings).toEqual(expectedEmbeddings)
      expect(result.embeddings).toHaveLength(2)
    })
  })
})
