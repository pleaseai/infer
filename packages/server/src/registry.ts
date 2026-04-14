import type { ModelEntry, ModelType } from './config'
import { invalidRequest, modelNotFound } from './errors'

export interface Registry {
  list: () => ModelEntry[]
  get: (id: string) => ModelEntry | undefined
  requireType: (id: string, type: ModelType) => ModelEntry
}

export function createRegistry(models: ModelEntry[]): Registry {
  const byId = new Map<string, ModelEntry>()
  for (const m of models) {
    byId.set(m.id, m)
  }

  return {
    list() {
      return Array.from(byId.values())
    },
    get(id) {
      return byId.get(id)
    },
    requireType(id, type) {
      const m = byId.get(id)
      if (!m) {
        throw modelNotFound(id)
      }
      if (m.type !== type) {
        throw invalidRequest(
          `Model '${id}' is of type '${m.type}', not '${type}'`,
          'model',
          'invalid_model_type',
        )
      }
      return m
    },
  }
}
