import type { EmbedRequest, RerankRequest } from './types'
import { describe, expect, it, mock } from 'bun:test'
import { TeiClient } from './tei-client'

function makeFetch(response: unknown, ok = true, status = 200): typeof fetch {
  return mock(async (_url: string | URL | Request, _init?: RequestInit) => {
    const body = JSON.stringify(response)
    return {
      ok,
      status,
      text: async () => body,
      json: async () => response,
    } as Response
  }) as unknown as typeof fetch
}

describe('TeiClient', () => {
  describe('embed()', () => {
    it('sends correct request and returns parsed response', async () => {
      const expectedResponse = [[0.1, 0.2, 0.3]]
      const fetchFn = makeFetch(expectedResponse)
      const client = new TeiClient({ baseUrl: 'http://localhost:8080' }, fetchFn)

      const req: EmbedRequest = { inputs: 'hello world' }
      const result = await client.embed(req)

      expect(fetchFn).toHaveBeenCalledTimes(1)
      expect(fetchFn).toHaveBeenCalledWith('http://localhost:8080/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      })
      expect(result).toEqual(expectedResponse)
    })

    it('handles single string input', async () => {
      const expectedResponse = [[0.1, 0.2, 0.3]]
      const fetchFn = makeFetch(expectedResponse)
      const client = new TeiClient({ baseUrl: 'http://localhost:8080' }, fetchFn)

      const result = await client.embed({ inputs: 'single text' })

      expect(result).toEqual(expectedResponse)
      expect(result).toHaveLength(1)
    })

    it('handles array input (batch)', async () => {
      const expectedResponse = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ]
      const fetchFn = makeFetch(expectedResponse)
      const client = new TeiClient({ baseUrl: 'http://localhost:8080' }, fetchFn)

      const result = await client.embed({ inputs: ['text one', 'text two'] })

      expect(result).toEqual(expectedResponse)
      expect(result).toHaveLength(2)
    })

    it('throws on non-ok response with error details', async () => {
      const errorBody = 'Bad Request: invalid input'
      const fetchFn = mock(async () => ({
        ok: false,
        status: 400,
        text: async () => errorBody,
        json: async () => ({}),
      })) as unknown as typeof fetch
      const client = new TeiClient({ baseUrl: 'http://localhost:8080' }, fetchFn)

      await expect(client.embed({ inputs: 'hello' })).rejects.toThrow('400')
      await expect(client.embed({ inputs: 'hello' })).rejects.toThrow(errorBody)
    })
  })

  describe('rerank()', () => {
    it('sends correct request and returns parsed response', async () => {
      const expectedResponse = [
        { index: 0, score: 0.95 },
        { index: 1, score: 0.42 },
      ]
      const fetchFn = makeFetch(expectedResponse)
      const client = new TeiClient({ baseUrl: 'http://localhost:8080' }, fetchFn)

      const req: RerankRequest = {
        query: 'what is machine learning',
        texts: ['ML is a field of AI', 'cats are cute'],
      }
      const result = await client.rerank(req)

      expect(fetchFn).toHaveBeenCalledTimes(1)
      expect(fetchFn).toHaveBeenCalledWith('http://localhost:8080/rerank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      })
      expect(result).toEqual(expectedResponse)
    })

    it('throws on non-ok response with error details', async () => {
      const errorBody = 'Internal Server Error'
      const fetchFn = mock(async () => ({
        ok: false,
        status: 500,
        text: async () => errorBody,
        json: async () => ({}),
      })) as unknown as typeof fetch
      const client = new TeiClient({ baseUrl: 'http://localhost:8080' }, fetchFn)

      await expect(
        client.rerank({ query: 'test', texts: ['a', 'b'] }),
      ).rejects.toThrow('500')
      await expect(
        client.rerank({ query: 'test', texts: ['a', 'b'] }),
      ).rejects.toThrow(errorBody)
    })
  })
})
