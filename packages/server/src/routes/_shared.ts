import type { z } from 'zod'
import type { TeiBackend } from '../backends'
import type { ModelEntry } from '../config'
import { invalidRequest, notImplemented } from '../errors'

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  }
  catch {
    throw invalidRequest('Request body must be valid JSON')
  }
}

export function parseOrThrow<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.infer<S> {
  const parsed = schema.safeParse(raw)
  if (parsed.success)
    return parsed.data
  const first = parsed.error.issues[0]
  throw invalidRequest(first?.message ?? 'Invalid request', String(first?.path?.[0] ?? ''))
}

export async function resolveTeiBaseUrl(
  entry: ModelEntry,
  tei: TeiBackend,
  kind: 'embedding' | 'rerank',
): Promise<string> {
  // Exhaustive switch — adding a new Backend variant will fail type-check here.
  switch (entry.backend) {
    case 'tei': {
      const proc = await tei.ensureRunning(entry.id)
      return `http://127.0.0.1:${proc.port}`
    }
    case 'llama':
      throw notImplemented(`${kind} backend 'llama' is not implemented`, 'backend_unavailable')
    default: {
      const exhaustive: never = entry.backend
      throw notImplemented(`Unknown backend: ${String(exhaustive)}`, 'backend_unavailable')
    }
  }
}
