import type { EmbedRequest, EmbedResponse } from '@infer-please/tei'
import { z } from 'zod'

export const openAIEmbeddingsRequestSchema = z.object({
  model: z.string().min(1),
  input: z.union([
    z.string().min(1),
    z.array(z.string()).min(1),
  ]),
  encoding_format: z.literal('float').optional(),
  dimensions: z.number().int().positive().optional(),
  user: z.string().optional(),
})

export type OpenAIEmbeddingsRequest = z.infer<typeof openAIEmbeddingsRequestSchema>

export interface OpenAIEmbeddingItem {
  object: 'embedding'
  index: number
  embedding: number[]
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
  const data: OpenAIEmbeddingItem[] = vectors.map((embedding, index) => ({
    object: 'embedding',
    index,
    embedding,
  }))
  const tokens = estimateTokens(req.input)
  return {
    object: 'list',
    data,
    model: req.model,
    usage: { prompt_tokens: tokens, total_tokens: tokens },
  }
}
