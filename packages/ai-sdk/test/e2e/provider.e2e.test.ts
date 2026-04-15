import { createTeiManager, TeiManager } from '@pleaseai/infer-tei'
import { embed, embedMany } from 'ai'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { dockerFindBinary, dockerSpawnFn, hasDocker } from '../../../server/test/e2e/docker-spawn'
import { InferPleaseEmbeddingModel } from '../../src/embedding-model'

const TEST_MODEL = 'sentence-transformers/all-MiniLM-L6-v2'

// Inline skip gate rather than depending on the server package's helpers,
// since cross-package imports from test/ are fragile under Bun workspace
// resolution and this test only needs the Docker probe. Throws are deferred
// to beforeAll so CI failures attach to the suite, not module load.
const SKIP_REASON = (() => {
  if (process.env.RUN_E2E !== '1' && !process.env.CI) {
    return 'E2E tests are opt-in. Set RUN_E2E=1 or run via `bun run test:e2e`.'
  }
  if (!hasDocker()) {
    return 'Docker is not available. Start Docker Desktop or install Docker.'
  }
  return null
})()

describe.skipIf(SKIP_REASON !== null)('e2e: @pleaseai/infer-ai-sdk provider', () => {
  let manager: TeiManager

  beforeAll(() => {
    if (process.env.CI && !hasDocker()) {
      throw new Error('[E2E] Docker required in CI but not available')
    }
    manager = new TeiManager(
      {
        portRangeStart: 28080,
        portRangeEnd: 28099,
        idleTimeoutMs: 300_000,
        healthCheckTimeoutMs: 120_000,
      },
      dockerSpawnFn as unknown as ConstructorParameters<typeof TeiManager>[1],
      globalThis.fetch,
      dockerFindBinary,
    )
  })

  afterAll(async () => {
    if (manager) {
      await manager.stopAll()
    }
  })

  it('embed() returns a real vector', async () => {
    const model = new InferPleaseEmbeddingModel(TEST_MODEL, manager)
    const result = await embed({ model, value: 'hello world' })
    expect(Array.isArray(result.embedding)).toBe(true)
    expect(result.embedding.length).toBe(384)
    expect(result.embedding.every(x => typeof x === 'number' && Number.isFinite(x))).toBe(true)
  }, 180_000)

  it('embedMany() returns vectors for each input in order', async () => {
    const model = new InferPleaseEmbeddingModel(TEST_MODEL, manager)
    const result = await embedMany({ model, values: ['first', 'second', 'third'] })
    expect(result.embeddings).toHaveLength(3)
    for (const v of result.embeddings) {
      expect(v.length).toBe(384)
    }
  }, 180_000)

  it('createTeiManager default export still compiles (smoke)', () => {
    // Sanity check that the SDK's public factory is importable even though
    // this suite uses the constructor directly to inject the Docker spawnFn.
    const m = createTeiManager()
    expect(m).toBeDefined()
  })
})
