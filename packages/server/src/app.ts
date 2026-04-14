import type { TeiManager } from '@infer-please/tei'
import type { Hono } from 'hono'
import type { Backends, TeiBackend } from './backends'
import type { Config } from './config'
import { TeiClient } from '@infer-please/tei'
import { createRegistry } from './registry'
import { mountChatRoutes } from './routes/chat'
import { mountEmbeddingsRoutes } from './routes/embeddings'
import { mountModelsRoutes } from './routes/models'
import { mountRerankRoutes } from './routes/rerank'
import { createApp } from './server'

export function createTeiBackend(manager: TeiManager): TeiBackend {
  // Reuse one TeiClient per baseUrl so request-scoped allocations don't
  // defeat fetch keep-alive on the hot path.
  const clients = new Map<string, TeiClient>()
  const clientFor = (baseUrl: string): TeiClient => {
    let c = clients.get(baseUrl)
    if (!c) {
      c = new TeiClient({ baseUrl })
      clients.set(baseUrl, c)
    }
    return c
  }

  return {
    ensureRunning: id => manager.ensureRunning(id),
    embed: (baseUrl, request) => clientFor(baseUrl).embed(request),
    rerank: (baseUrl, request) => clientFor(baseUrl).rerank(request),
  }
}

export interface BuildAppDeps {
  config: Config
  backends: Backends
}

export function buildApp(deps: BuildAppDeps): Hono {
  const { config, backends } = deps
  const app = createApp({ authToken: config.auth?.token })
  const registry = createRegistry(config.models)

  mountModelsRoutes(app, registry)
  mountEmbeddingsRoutes(app, registry, backends)
  mountRerankRoutes(app, registry, backends)
  mountChatRoutes(app)

  return app
}
