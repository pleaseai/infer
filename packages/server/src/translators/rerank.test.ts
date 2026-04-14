import { describe, expect, it } from 'bun:test'
import {
  cohereRerankRequestSchema,
  cohereToTeiRerank,
  estimateRerankTokens,
  teiToCohereRerank,
} from './rerank'

describe('cohereRerankRequestSchema', () => {
  it('accepts minimal valid request', () => {
    const r = cohereRerankRequestSchema.parse({
      model: 'rerank-1',
      query: 'q',
      documents: ['d1', 'd2'],
    })
    expect(r.return_documents).toBe(false)
  })

  it('accepts top_n and return_documents', () => {
    const r = cohereRerankRequestSchema.parse({
      model: 'm',
      query: 'q',
      documents: ['a'],
      top_n: 3,
      return_documents: true,
    })
    expect(r.top_n).toBe(3)
    expect(r.return_documents).toBe(true)
  })

  it('rejects empty documents array', () => {
    expect(() => cohereRerankRequestSchema.parse({
      model: 'm', query: 'q', documents: [],
    })).toThrow()
  })

  it('rejects non-positive top_n', () => {
    expect(() => cohereRerankRequestSchema.parse({
      model: 'm', query: 'q', documents: ['a'], top_n: 0,
    })).toThrow()
  })
})

describe('cohereToTeiRerank', () => {
  it('maps query and documents into TEI shape', () => {
    const out = cohereToTeiRerank({
      model: 'm', query: 'q', documents: ['a', 'b'], return_documents: false,
    })
    expect(out).toEqual({ query: 'q', texts: ['a', 'b'], return_text: false })
  })

  it('forwards return_documents=true as return_text=true', () => {
    const out = cohereToTeiRerank({
      model: 'm', query: 'q', documents: ['a'], return_documents: true,
    })
    expect(out.return_text).toBe(true)
  })
})

describe('teiToCohereRerank', () => {
  it('renames score -> relevance_score and sorts descending', () => {
    const out = teiToCohereRerank(
      [
        { index: 0, score: 0.3 },
        { index: 1, score: 0.9 },
        { index: 2, score: 0.6 },
      ],
      { model: 'm', query: 'q', documents: ['a', 'b', 'c'], return_documents: false },
    )
    expect(out.results.map(r => r.index)).toEqual([1, 2, 0])
    expect(out.results.map(r => r.relevance_score)).toEqual([0.9, 0.6, 0.3])
    expect(out.model).toBe('m')
    expect(out.results[0]).not.toHaveProperty('document')
  })

  it('honors top_n by truncating sorted results', () => {
    const out = teiToCohereRerank(
      [
        { index: 0, score: 0.3 },
        { index: 1, score: 0.9 },
        { index: 2, score: 0.6 },
      ],
      { model: 'm', query: 'q', documents: ['a', 'b', 'c'], return_documents: false, top_n: 2 },
    )
    expect(out.results).toHaveLength(2)
    expect(out.results.map(r => r.index)).toEqual([1, 2])
  })

  it('attaches document text when return_documents is true', () => {
    const out = teiToCohereRerank(
      [
        { index: 0, score: 0.5, text: 'aa' },
        { index: 1, score: 0.7, text: 'bb' },
      ],
      { model: 'm', query: 'q', documents: ['aa', 'bb'], return_documents: true },
    )
    expect(out.results[0]?.document).toEqual({ text: 'bb' })
    expect(out.results[1]?.document).toEqual({ text: 'aa' })
  })

  it('falls back to original documents array when TEI omits text', () => {
    const out = teiToCohereRerank(
      [
        { index: 0, score: 0.5 },
        { index: 1, score: 0.7 },
      ],
      { model: 'm', query: 'q', documents: ['aa', 'bb'], return_documents: true },
    )
    expect(out.results[0]?.document).toEqual({ text: 'bb' })
  })
})

describe('estimateRerankTokens', () => {
  it('counts query and documents combined', () => {
    expect(estimateRerankTokens('1234', ['1234', '12345678'])).toBe(4)
  })
})
