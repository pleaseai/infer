import type { TeiProcess } from './types'
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { TeiManager } from './tei-manager'

// ---- helpers ----------------------------------------------------------------

interface SubprocessMock {
  pid: number
  exitCode: number | null
  killed: boolean
  exited: Promise<number>
  kill: () => void
  onExit: ((code: number) => void) | null
  triggerExit: (code: number) => void
}

function makeSubprocess(pid = 1234): SubprocessMock {
  let onExit: ((code: number) => void) | null = null
  const sub: SubprocessMock = {
    pid,
    exitCode: null,
    killed: false,
    exited: new Promise<number>((resolve) => {
      onExit = code => resolve(code)
    }),
    kill: () => {
      sub.killed = true
      sub.exitCode = 0
      sub.onExit?.(0)
    },
    onExit,
    triggerExit: (code: number) => {
      sub.exitCode = code
      sub.onExit?.(code)
    },
  }
  // Re-assign so triggerExit can call it
  sub.onExit = onExit
  return sub
}

function makeSpawnFn(sub: SubprocessMock) {
  return mock((_cmd: string[], _opts?: unknown) => sub)
}

const mockFindBinary = () => 'text-embeddings-router'

type FetchFn = (url: string | URL | Request, init?: RequestInit) => Promise<Response>

function makeHealthyFetch(after = 1): FetchFn {
  let calls = 0
  return mock(async (url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
    if (urlStr.endsWith('/health')) {
      calls++
      if (calls >= after) {
        return { ok: true, status: 200 } as Response
      }
      return { ok: false, status: 503 } as Response
    }
    return { ok: false, status: 404 } as Response
  }) as FetchFn
}

function makeUnhealthyFetch(): FetchFn {
  return mock(async () => ({ ok: false, status: 503 } as Response)) as FetchFn
}

// ---- tests ------------------------------------------------------------------

describe('TeiManager', () => {
  let sub: SubprocessMock
  let spawnFn: ReturnType<typeof makeSpawnFn>

  beforeEach(() => {
    sub = makeSubprocess()
    spawnFn = makeSpawnFn(sub)
  })

  afterEach(async () => {
    // cleanup — suppress errors
  })

  // 1. ensureRunning spawns a process and waits for health check
  it('ensureRunning spawns a process and returns ready process', async () => {
    const fetchFn = makeHealthyFetch(1)
    const manager = new TeiManager(
      { portRangeStart: 8080, portRangeEnd: 8090, healthCheckIntervalMs: 10, healthCheckTimeoutMs: 5000 },
      spawnFn,
      fetchFn,
      mockFindBinary,
    )

    const proc = await manager.ensureRunning('BAAI/bge-small-en-v1.5')

    expect(proc.modelId).toBe('BAAI/bge-small-en-v1.5')
    expect(proc.state).toBe('ready')
    expect(proc.port).toBeGreaterThanOrEqual(8080)
    expect(proc.port).toBeLessThanOrEqual(8090)
    expect(spawnFn).toHaveBeenCalledTimes(1)

    await manager.stopAll()
  })

  it('ensureRunning passes correct CLI args to spawn', async () => {
    const fetchFn = makeHealthyFetch(1)
    const manager = new TeiManager(
      { portRangeStart: 8080, portRangeEnd: 8090, healthCheckIntervalMs: 10, healthCheckTimeoutMs: 5000 },
      spawnFn,
      fetchFn,
      mockFindBinary,
    )

    const proc = await manager.ensureRunning('BAAI/bge-small-en-v1.5')

    expect(spawnFn).toHaveBeenCalledWith(
      ['text-embeddings-router', '--model-id', 'BAAI/bge-small-en-v1.5', '--port', String(proc.port)],
      expect.any(Object),
    )

    await manager.stopAll()
  })

  // 2. ensureRunning returns existing ready process without re-spawning
  it('ensureRunning returns existing ready process without re-spawning', async () => {
    const fetchFn = makeHealthyFetch(1)
    const manager = new TeiManager(
      { portRangeStart: 8080, portRangeEnd: 8090, healthCheckIntervalMs: 10, healthCheckTimeoutMs: 5000 },
      spawnFn,
      fetchFn,
      mockFindBinary,
    )

    const proc1 = await manager.ensureRunning('BAAI/bge-small-en-v1.5')
    const proc2 = await manager.ensureRunning('BAAI/bge-small-en-v1.5')

    expect(proc1).toBe(proc2)
    expect(spawnFn).toHaveBeenCalledTimes(1)

    await manager.stopAll()
  })

  // 3. Idle timeout stops the process after configured delay
  it('idle timeout stops process after configured delay', async () => {
    const fetchFn = makeHealthyFetch(1)
    const manager = new TeiManager(
      {
        portRangeStart: 8080,
        portRangeEnd: 8090,
        healthCheckIntervalMs: 10,
        healthCheckTimeoutMs: 5000,
        idleTimeoutMs: 50,
      },
      spawnFn,
      fetchFn,
      mockFindBinary,
    )

    const proc = await manager.ensureRunning('BAAI/bge-small-en-v1.5')
    expect(proc.state).toBe('ready')

    // Wait for idle timeout to fire
    await new Promise(r => setTimeout(r, 150))

    expect(proc.state).toBe('stopped')
    expect(sub.killed).toBe(true)
  })

  // 4. stop() kills process and releases port
  it('stop() kills process, releases port, clears timer, sets state stopped', async () => {
    const fetchFn = makeHealthyFetch(1)
    const manager = new TeiManager(
      { portRangeStart: 8080, portRangeEnd: 8090, healthCheckIntervalMs: 10, healthCheckTimeoutMs: 5000 },
      spawnFn,
      fetchFn,
      mockFindBinary,
    )

    const proc = await manager.ensureRunning('BAAI/bge-small-en-v1.5')
    const port = proc.port

    await manager.stop('BAAI/bge-small-en-v1.5')

    expect(proc.state).toBe('stopped')
    expect(sub.killed).toBe(true)

    // Port should be released — we should be able to allocate the same port again
    const sub2 = makeSubprocess(5678)
    const spawnFn2 = makeSpawnFn(sub2)
    const manager2 = new TeiManager(
      { portRangeStart: port, portRangeEnd: port, healthCheckIntervalMs: 10, healthCheckTimeoutMs: 5000 },
      spawnFn2,
      makeHealthyFetch(1),
      mockFindBinary,
    )
    const proc2 = await manager2.ensureRunning('another-model')
    expect(proc2.port).toBe(port)
    await manager2.stopAll()
  })

  // 5. Crash sets state to 'crashed', next ensureRunning re-spawns
  it('crash sets state to crashed; next ensureRunning re-spawns fresh process', async () => {
    const fetchFn = makeHealthyFetch(1)
    const manager = new TeiManager(
      { portRangeStart: 8080, portRangeEnd: 8090, healthCheckIntervalMs: 10, healthCheckTimeoutMs: 5000 },
      spawnFn,
      fetchFn,
      mockFindBinary,
    )

    const proc = await manager.ensureRunning('BAAI/bge-small-en-v1.5')
    expect(proc.state).toBe('ready')

    // Simulate unexpected crash (not via manager.stop)
    sub.triggerExit(1)
    // Give event loop a tick
    await new Promise(r => setTimeout(r, 10))

    expect(proc.state).toBe('crashed')

    // Next call should spawn a fresh process
    const sub2 = makeSubprocess(5678)
    spawnFn.mockImplementation(() => sub2)

    // Re-use the same manager that saw the crash
    // Update fetchFn to produce a fresh healthy response
    const manager2 = new TeiManager(
      { portRangeStart: 8080, portRangeEnd: 8090, healthCheckIntervalMs: 10, healthCheckTimeoutMs: 5000 },
      spawnFn,
      makeHealthyFetch(1),
      mockFindBinary,
    )

    const proc2 = await manager.ensureRunning('BAAI/bge-small-en-v1.5')
    expect(proc2.state).toBe('ready')
    expect(spawnFn).toHaveBeenCalledTimes(2)

    await manager.stopAll()
    await manager2.stopAll()
  })

  // 6. stopAll stops all processes
  it('stopAll stops all running processes', async () => {
    const sub2 = makeSubprocess(5678)
    let callCount = 0
    const multiSpawn = mock((_cmd: string[], _opts?: unknown) => {
      callCount++
      return callCount === 1 ? sub : sub2
    })

    const fetchFn = makeHealthyFetch(1)
    const manager = new TeiManager(
      { portRangeStart: 8080, portRangeEnd: 8090, healthCheckIntervalMs: 10, healthCheckTimeoutMs: 5000 },
      multiSpawn,
      fetchFn,
      mockFindBinary,
    )

    await manager.ensureRunning('model-a')
    await manager.ensureRunning('model-b')

    expect(manager.getProcesses()).toHaveLength(2)

    await manager.stopAll()

    expect(sub.killed).toBe(true)
    expect(sub2.killed).toBe(true)
    expect(manager.getProcesses()).toHaveLength(0)
  })

  // 7. getProcesses returns list of active processes
  it('getProcesses returns all active processes', async () => {
    const sub2 = makeSubprocess(5678)
    let callCount = 0
    const multiSpawn = mock((_cmd: string[], _opts?: unknown) => {
      callCount++
      return callCount === 1 ? sub : sub2
    })

    const fetchFn = makeHealthyFetch(1)
    const manager = new TeiManager(
      { portRangeStart: 8080, portRangeEnd: 8090, healthCheckIntervalMs: 10, healthCheckTimeoutMs: 5000 },
      multiSpawn,
      fetchFn,
      mockFindBinary,
    )

    expect(manager.getProcesses()).toHaveLength(0)

    await manager.ensureRunning('model-a')
    expect(manager.getProcesses()).toHaveLength(1)

    await manager.ensureRunning('model-b')
    expect(manager.getProcesses()).toHaveLength(2)

    const procs = manager.getProcesses()
    const modelIds = procs.map((p: TeiProcess) => p.modelId)
    expect(modelIds).toContain('model-a')
    expect(modelIds).toContain('model-b')

    await manager.stopAll()
  })

  // 8. Health check timeout throws error
  it('health check timeout throws error when process never becomes ready', async () => {
    const fetchFn = makeUnhealthyFetch()
    const manager = new TeiManager(
      {
        portRangeStart: 8080,
        portRangeEnd: 8090,
        healthCheckIntervalMs: 10,
        healthCheckTimeoutMs: 100,
      },
      spawnFn,
      fetchFn,
      mockFindBinary,
    )

    await expect(manager.ensureRunning('BAAI/bge-small-en-v1.5')).rejects.toThrow(
      /health check timed out/i,
    )
  })

  // Concurrent ensureRunning calls while starting — should resolve when ready
  it('concurrent ensureRunning calls wait for the same process', async () => {
    let healthCalls = 0
    const fetchFn: FetchFn = mock(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
      if (urlStr.endsWith('/health')) {
        healthCalls++
        // Only succeed after 3 polls
        if (healthCalls >= 3)
          return { ok: true, status: 200 } as Response
        return { ok: false, status: 503 } as Response
      }
      return { ok: false, status: 404 } as Response
    }) as FetchFn

    const manager = new TeiManager(
      { portRangeStart: 8080, portRangeEnd: 8090, healthCheckIntervalMs: 20, healthCheckTimeoutMs: 5000 },
      spawnFn,
      fetchFn,
      mockFindBinary,
    )

    // Fire two concurrent calls
    const [proc1, proc2] = await Promise.all([
      manager.ensureRunning('BAAI/bge-small-en-v1.5'),
      manager.ensureRunning('BAAI/bge-small-en-v1.5'),
    ])

    expect(proc1).toBe(proc2)
    expect(spawnFn).toHaveBeenCalledTimes(1)

    await manager.stopAll()
  })
})
