import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'bun:test'
import {
  estimateTokens,
  openAIEmbeddingsRequestSchema,
  openAIToTeiEmbed,
  teiToOpenAIEmbeddings,
} from './embeddings'

describe('openAIEmbeddingsRequestSchema', () => {
  it('accepts string input', () => {
    const r = openAIEmbeddingsRequestSchema.parse({ model: 'm', input: 'hello' })
    expect(r.input).toBe('hello')
  })

  it('accepts array of strings', () => {
    const r = openAIEmbeddingsRequestSchema.parse({ model: 'm', input: ['a', 'b'] })
    expect(r.input).toEqual(['a', 'b'])
  })

  it('rejects empty model', () => {
    expect(() => openAIEmbeddingsRequestSchema.parse({ model: '', input: 'x' })).toThrow()
  })

  it('rejects empty array input', () => {
    expect(() => openAIEmbeddingsRequestSchema.parse({ model: 'm', input: [] })).toThrow()
  })

  it('rejects unsupported encoding_format', () => {
    expect(() => openAIEmbeddingsRequestSchema.parse({ model: 'm', input: 'x', encoding_format: 'binary' })).toThrow()
  })

  it('accepts encoding_format=float', () => {
    const r = openAIEmbeddingsRequestSchema.parse({ model: 'm', input: 'x', encoding_format: 'float' })
    expect(r.encoding_format).toBe('float')
  })

  it('accepts encoding_format=base64', () => {
    const r = openAIEmbeddingsRequestSchema.parse({ model: 'm', input: 'x', encoding_format: 'base64' })
    expect(r.encoding_format).toBe('base64')
  })

  it('defaults encoding_format to float when omitted', () => {
    const r = openAIEmbeddingsRequestSchema.parse({ model: 'm', input: 'x' })
    expect(r.encoding_format).toBe('float')
  })
})

describe('openAIToTeiEmbed', () => {
  it('passes string input through', () => {
    expect(openAIToTeiEmbed({ model: 'm', input: 'hi', encoding_format: 'float' })).toEqual({ inputs: 'hi' })
  })

  it('passes array input through', () => {
    expect(openAIToTeiEmbed({ model: 'm', input: ['a', 'b'], encoding_format: 'float' })).toEqual({ inputs: ['a', 'b'] })
  })
})

describe('teiToOpenAIEmbeddings', () => {
  it('builds OpenAI list response with usage tokens', () => {
    const out = teiToOpenAIEmbeddings(
      [[0.1, 0.2], [0.3, 0.4]],
      { model: 'embed-1', input: ['foo', 'barbaz'], encoding_format: 'float' },
    )
    expect(out.object).toBe('list')
    expect(out.model).toBe('embed-1')
    expect(out.data).toHaveLength(2)
    expect(out.data[0]).toEqual({ object: 'embedding', index: 0, embedding: [0.1, 0.2] })
    expect(out.data[1]?.index).toBe(1)
    expect(out.usage.prompt_tokens).toBeGreaterThan(0)
    expect(out.usage.total_tokens).toBe(out.usage.prompt_tokens)
  })

  it('handles single string input', () => {
    const out = teiToOpenAIEmbeddings([[1, 2, 3]], { model: 'm', input: 'hi', encoding_format: 'float' })
    expect(out.data).toHaveLength(1)
    expect(out.data[0]?.embedding).toEqual([1, 2, 3])
  })

  it('encodes embeddings as base64 when requested', () => {
    const out = teiToOpenAIEmbeddings([[1.5, 2.5]], { model: 'm', input: 'hi', encoding_format: 'base64' })
    expect(typeof out.data[0]?.embedding).toBe('string')
    // Float32: 1.5=0x3FC00000 little-endian => 00 00 C0 3F, 2.5=0x40200000 => 00 00 20 40
    expect(out.data[0]?.embedding).toBe(Buffer.from([0, 0, 0xC0, 0x3F, 0, 0, 0x20, 0x40]).toString('base64'))
  })
})

describe('estimateTokens', () => {
  it('returns rough character/4 estimate per input', () => {
    expect(estimateTokens('1234')).toBe(1)
    expect(estimateTokens('12345678')).toBe(2)
    expect(estimateTokens(['1234', '12345678'])).toBe(3)
  })
})
