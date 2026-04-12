import { describe, expect, it } from 'bun:test'
import { createInferPlease, InferPleaseEmbeddingModel } from './index'

describe('createInferPlease()', () => {
  it('returns an object with textEmbeddingModel method', () => {
    const provider = createInferPlease()
    expect(typeof provider.textEmbeddingModel).toBe('function')
  })

  it('textEmbeddingModel() returns an InferPleaseEmbeddingModel instance', () => {
    const provider = createInferPlease()
    const model = provider.textEmbeddingModel('BAAI/bge-small-en-v1.5')
    expect(model).toBeInstanceOf(InferPleaseEmbeddingModel)
  })

  it('returned model has correct modelId', () => {
    const provider = createInferPlease()
    const model = provider.textEmbeddingModel('BAAI/bge-small-en-v1.5')
    expect(model.modelId).toBe('BAAI/bge-small-en-v1.5')
  })

  it('returns different model instances for different modelIds', () => {
    const provider = createInferPlease()
    const model1 = provider.textEmbeddingModel('model-a')
    const model2 = provider.textEmbeddingModel('model-b')
    expect(model1.modelId).toBe('model-a')
    expect(model2.modelId).toBe('model-b')
  })
})

describe('barrel exports', () => {
  it('exports InferPleaseEmbeddingModel', () => {
    expect(InferPleaseEmbeddingModel).toBeDefined()
  })

  it('exports createInferPlease', () => {
    expect(createInferPlease).toBeDefined()
    expect(typeof createInferPlease).toBe('function')
  })
})
