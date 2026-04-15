import type { Server } from 'bun'
import type { Config } from '../../src/config'
import process from 'node:process'
import { TeiManager } from '@pleaseai/infer-tei'
import { buildApp, createTeiBackend } from '../../src/app'
import { parseConfig } from '../../src/config'
import { dockerFindBinary, dockerSpawnFn, hasDocker } from './docker-spawn'

export const TEST_EMBED_MODEL = 'sentence-transformers/all-MiniLM-L6-v2'
export const TEST_RERANK_MODEL = 'BAAI/bge-reranker-base'

export interface TestServerHandle {
  url: string
  port: number
  teiManager: TeiManager
  server: Server
  shutdown: () => Promise<void>
}

export interface StartTestServerOptions {
  models?: Config['models']
  authToken?: string
  portRangeStart?: number
  portRangeEnd?: number
  idleTimeoutMs?: number
  healthCheckTimeoutMs?: number
}

/**
 * Start a real infer-please server bound to an ephemeral port, backed by a
 * TeiManager whose `spawnFn` runs TEI inside a Docker container.
 *
 * Caller is responsible for calling `handle.shutdown()` in `afterAll` to
 * stop the HTTP server and terminate any spawned TEI containers.
 */
export async function startTestServer(
  options: StartTestServerOptions = {},
): Promise<TestServerHandle> {
  const models = options.models ?? [
    { id: TEST_EMBED_MODEL, type: 'embedding', backend: 'tei', repo_id: TEST_EMBED_MODEL },
  ]

  const config = parseConfig({
    auth: options.authToken ? { token: options.authToken } : undefined,
    models,
  })

  const teiManager = new TeiManager(
    {
      portRangeStart: options.portRangeStart ?? 18080,
      portRangeEnd: options.portRangeEnd ?? 18099,
      idleTimeoutMs: options.idleTimeoutMs ?? 300_000,
      healthCheckTimeoutMs: options.healthCheckTimeoutMs ?? 120_000,
    },
    dockerSpawnFn as unknown as ConstructorParameters<typeof TeiManager>[1],
    globalThis.fetch,
    dockerFindBinary,
  )

  const backends = { tei: createTeiBackend(teiManager) }
  const app = buildApp({ config, backends })

  const server = Bun.serve({ port: 0, fetch: app.fetch })
  const port = server.port
  const url = `http://localhost:${port}`

  const shutdown = async (): Promise<void> => {
    server.stop()
    await teiManager.stopAll()
  }

  return { url, port, teiManager, server, shutdown }
}

/**
 * Compute the E2E skip reason for the current environment.
 *
 * Returns `null` when E2E tests should run, or a human-readable reason string
 * when they should be skipped. Tests use:
 *
 *   describe.skipIf(E2E_SKIP_REASON !== null)('...', () => { ... })
 *
 * The spec's "TEI binary on $PATH" requirement maps to "Docker running"
 * in this implementation — see plan.md's Architecture Decision for rationale.
 */
export function computeSkipReason(): string | null {
  // Opt-in gate: default `bun test` must not spin up Docker.
  if (process.env.RUN_E2E !== '1' && !process.env.CI) {
    return 'E2E tests are opt-in. Set RUN_E2E=1 or run via `bun run test:e2e`.'
  }

  if (!hasDocker()) {
    const msg = 'Docker is not available. Start Docker Desktop or install Docker.'
    // In CI, a missing Docker is a workflow bug, not a test environment condition.
    if (process.env.CI) {
      throw new Error(`[E2E] ${msg}`)
    }
    return msg
  }

  return null
}

export const E2E_SKIP_REASON = computeSkipReason()
