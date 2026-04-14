import type { RerankRequest, RerankResponse } from '@pleaseai/infer-tei'
import { z } from 'zod'

export const cohereRerankRequestSchema = z.object({
  model: z.string().min(1),
  query: z.string().min(1),
  documents: z.array(z.string()).min(1),
  top_n: z.number().int().positive().optional(),
  return_documents: z.boolean().default(false),
})

export type CohereRerankRequest = z.infer<typeof cohereRerankRequestSchema>

export interface CohereRerankResult {
  index: number
  relevance_score: number
  document?: { text: string }
}

export interface CohereRerankResponse {
  model: string
  results: CohereRerankResult[]
  usage: {
    prompt_tokens: number
    total_tokens: number
  }
}

export function cohereToTeiRerank(req: CohereRerankRequest): RerankRequest {
  return {
    query: req.query,
    texts: req.documents,
    return_text: req.return_documents,
  }
}

export function estimateRerankTokens(query: string, documents: string[]): number {
  const tokensFor = (s: string) => Math.max(1, Math.ceil(s.length / 4))
  return [query, ...documents].reduce((sum, s) => sum + tokensFor(s), 0)
}

export function teiToCohereRerank(
  results: RerankResponse,
  req: CohereRerankRequest,
): CohereRerankResponse {
  const sorted = [...results].sort((a, b) => b.score - a.score)
  const limited = req.top_n != null ? sorted.slice(0, req.top_n) : sorted

  const items: CohereRerankResult[] = limited.map((r) => {
    const item: CohereRerankResult = { index: r.index, relevance_score: r.score }
    if (req.return_documents) {
      const text = r.text ?? req.documents[r.index] ?? ''
      item.document = { text }
    }
    return item
  })

  const tokens = estimateRerankTokens(req.query, req.documents)
  return {
    model: req.model,
    results: items,
    usage: { prompt_tokens: tokens, total_tokens: tokens },
  }
}
