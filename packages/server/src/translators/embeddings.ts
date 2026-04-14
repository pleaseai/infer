import type { EmbedRequest, EmbedResponse } from '@infer-please/tei'
import { Buffer } from 'node:buffer'
import { z } from 'zod'

export const openAIEmbeddingsRequestSchema = z.object({
  model: z.string().min(1),
  input: z.union([
    z.string().min(1),
    z.array(z.string()).min(1),
  ]),
  encoding_format: z.enum(['float', 'base64']).default('float'),
  dimensions: z.number().int().positive().optional(),
  user: z.string().optional(),
})

export type OpenAIEmbeddingsRequest = z.infer<typeof openAIEmbeddingsRequestSchema>

export interface OpenAIEmbeddingItem {
  object: 'embedding'
  index: number
  embedding: number[] | string
}

function floatsToBase64(values: number[]): string {
  const buf = new ArrayBuffer(values.length * 4)
  const view = new Float32Array(buf)
  for (let i = 0; i < values.length; i++) view[i] = values[i] ?? 0
  return Buffer.from(buf).toString('base64')
}

export interface OpenAIEmbeddingsResponse {
  object: 'list'
  data: OpenAIEmbeddingItem[]
  model: string
  usage: {
    prompt_tokens: number
    total_tokens: number
  }
}

export function openAIToTeiEmbed(req: OpenAIEmbeddingsRequest): EmbedRequest {
  return { inputs: req.input }
}

export function estimateTokens(input: string | string[]): number {
  const arr = Array.isArray(input) ? input : [input]
  return arr.reduce((sum, s) => sum + Math.max(1, Math.ceil(s.length / 4)), 0)
}

export function teiToOpenAIEmbeddings(
  vectors: EmbedResponse,
  req: OpenAIEmbeddingsRequest,
): OpenAIEmbeddingsResponse {
  const useBase64 = req.encoding_format === 'base64'
  const data: OpenAIEmbeddingItem[] = vectors.map((vec, index) => ({
    object: 'embedding',
    index,
    embedding: useBase64 ? floatsToBase64(vec) : vec,
  }))
  const tokens = estimateTokens(req.input)
  return {
    object: 'list',
    data,
    model: req.model,
    usage: { prompt_tokens: tokens, total_tokens: tokens },
  }
}
