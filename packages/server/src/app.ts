import type { TeiManager } from '@infer-please/tei'
import type { Hono } from 'hono'
import type { Config } from './config'
import type { Backends, TeiBackend } from './routes/embeddings'
import { TeiClient } from '@infer-please/tei'
import { createRegistry } from './registry'
import { mountChatRoutes } from './routes/chat'
import { mountEmbeddingsRoutes } from './routes/embeddings'
import { mountModelsRoutes } from './routes/models'
import { mountRerankRoutes } from './routes/rerank'
import { createApp } from './server'

export function createTeiBackend(manager: TeiManager): TeiBackend {
  return {
    ensureRunning: id => manager.ensureRunning(id),
    embed: (baseUrl, request) => new TeiClient({ baseUrl }).embed(request),
    rerank: (baseUrl, request) => new TeiClient({ baseUrl }).rerank(request),
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
