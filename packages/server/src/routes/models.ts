import type { Hono } from 'hono'
import type { ModelEntry } from '../config'
import type { Registry } from '../registry'
import { modelNotFound } from '../errors'

interface OpenAIModel {
  id: string
  object: 'model'
  created: number
  owned_by: string
}

function ownerOf(repoId: string): string {
  const slash = repoId.indexOf('/')
  return slash > 0 ? repoId.slice(0, slash) : 'infer-please'
}

function toOpenAI(entry: ModelEntry, createdAt: number): OpenAIModel {
  return {
    id: entry.id,
    object: 'model',
    created: createdAt,
    owned_by: ownerOf(entry.repo_id),
  }
}

export interface MountModelsOptions {
  /** Unix epoch seconds used for the `created` field. Default: server start time. */
  createdAt?: number
}

export function mountModelsRoutes(
  app: Hono,
  registry: Registry,
  options: MountModelsOptions = {},
): void {
  const created = options.createdAt ?? Math.floor(Date.now() / 1000)

  app.get('/v1/models', (c) => {
    return c.json({
      object: 'list',
      data: registry.list().map(m => toOpenAI(m, created)),
    })
  })

  // Use catch-all so model ids containing '/' (e.g. 'org/name') still match.
  app.get('/v1/models/:id{.+}', (c) => {
    const id = c.req.param('id')
    const entry = registry.get(id)
    if (!entry) {
      throw modelNotFound(id)
    }
    return c.json(toOpenAI(entry, created))
  })
}
