import type { TestServerHandle } from './helpers'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { E2E_SKIP_REASON, startTestServer, TEST_EMBED_MODEL } from './helpers'

async function postEmbedding(url: string, input: string): Promise<Response> {
  return fetch(`${url}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: TEST_EMBED_MODEL, input }),
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe.skipIf(E2E_SKIP_REASON !== null)('e2e: TEI process lifecycle', () => {
  let handle: TestServerHandle

  beforeAll(async () => {
    handle = await startTestServer({
      // Short idle timeout so the test observes the stop→respawn cycle without
      // spending minutes waiting. Health check gets the normal 2m timeout
      // because first-run model download dominates the wall clock.
      idleTimeoutMs: 3_000,
      healthCheckTimeoutMs: 120_000,
      // Use a distinct port range so parallel suites don't collide.
      portRangeStart: 19080,
      portRangeEnd: 19099,
    })
  })

  afterAll(async () => {
    if (handle) {
      await handle.shutdown()
    }
  })

  it('shuts the backend container down after idle and respawns on next request', async () => {
    // First request → spawn container, model becomes ready
    const r1 = await postEmbedding(handle.url, 'first request')
    expect(r1.status).toBe(200)

    const procsAfterFirst = handle.teiManager.getProcesses()
    expect(procsAfterFirst).toHaveLength(1)
    expect(procsAfterFirst[0]!.state).toBe('ready')
    const firstPort = procsAfterFirst[0]!.port

    // Wait past idleTimeoutMs so the idle timer fires and stops the container.
    // We wait a generous buffer because docker stop takes ~2s.
    await sleep(6_000)

    const procsAfterIdle = handle.teiManager.getProcesses()
    expect(procsAfterIdle).toHaveLength(0)

    // Next request must respawn the backend. We don't require a different port
    // — the PortPool may reuse the freed one — but we do require a successful
    // response, meaning the full lifecycle (spawn → health → embed) ran again.
    const r2 = await postEmbedding(handle.url, 'second request after idle')
    expect(r2.status).toBe(200)

    const procsAfterRespawn = handle.teiManager.getProcesses()
    expect(procsAfterRespawn).toHaveLength(1)
    expect(procsAfterRespawn[0]!.state).toBe('ready')

    // Both allocations must come from the configured port range. The respawned
    // port may reuse firstPort (PortPool released it) or may be different.
    const respawnedPort = procsAfterRespawn[0]!.port
    for (const port of [firstPort, respawnedPort]) {
      expect(port).toBeGreaterThanOrEqual(19080)
      expect(port).toBeLessThanOrEqual(19099)
    }
  }, 300_000)
})
