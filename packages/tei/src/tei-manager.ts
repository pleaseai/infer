import type { TeiManagerOptions, TeiProcess, TeiProcessState } from './types'
import { findTeiBinary } from './binary'
import { PortPool } from './port-pool'

// ---- types ------------------------------------------------------------------

type FindBinaryFn = () => string
type SpawnFn = (cmd: string[], opts?: Record<string, unknown>) => SubprocessLike
type FetchFn = (url: string | URL | Request, init?: RequestInit) => Promise<Response>

interface SubprocessLike {
  kill: () => void
  exited: Promise<number>
}

// ---- defaults ---------------------------------------------------------------

const DEFAULT_OPTIONS: TeiManagerOptions = {
  portRangeStart: 8080,
  portRangeEnd: 8099,
  idleTimeoutMs: 300_000,
  healthCheckIntervalMs: 200,
  healthCheckTimeoutMs: 30_000,
}

// ---- internal state ---------------------------------------------------------

interface InternalProcess extends TeiProcess {
  subprocess: SubprocessLike | null
  readyResolvers: Array<(proc: TeiProcess) => void>
  readyRejectors: Array<(err: Error) => void>
}

// ---- TeiManager -------------------------------------------------------------

export class TeiManager {
  private readonly options: TeiManagerOptions
  private readonly portPool: PortPool
  private readonly processes = new Map<string, InternalProcess>()
  private readonly findBinary: FindBinaryFn
  private readonly spawnFn: SpawnFn
  private readonly fetchFn: FetchFn

  constructor(
    options: Partial<TeiManagerOptions> = {},
    spawnFn: SpawnFn = Bun.spawn as unknown as SpawnFn,
    fetchFn: FetchFn = globalThis.fetch,
    findBinary: FindBinaryFn = findTeiBinary,
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.portPool = new PortPool({
      start: this.options.portRangeStart,
      end: this.options.portRangeEnd,
    })
    this.findBinary = findBinary
    this.spawnFn = spawnFn
    this.fetchFn = fetchFn
  }

  // ---- public API -----------------------------------------------------------

  async ensureRunning(modelId: string): Promise<TeiProcess> {
    const existing = this.processes.get(modelId)

    if (existing) {
      if (existing.state === 'ready') {
        this.resetIdleTimer(existing)
        return existing
      }

      if (existing.state === 'starting') {
        return this.waitForReady(existing)
      }

      // crashed or stopped — fall through to spawn fresh
    }

    return this.spawnProcess(modelId)
  }

  async stop(modelId: string): Promise<void> {
    const proc = this.processes.get(modelId)
    if (!proc)
      return

    this.clearIdleTimer(proc)
    proc.state = 'stopping'

    if (proc.subprocess) {
      proc.subprocess.kill()
    }

    this.portPool.release(proc.port)
    proc.state = 'stopped'
    proc.subprocess = null
    this.processes.delete(modelId)
  }

  async stopAll(): Promise<void> {
    const modelIds = Array.from(this.processes.keys())
    await Promise.all(modelIds.map(id => this.stop(id)))
  }

  getProcesses(): TeiProcess[] {
    return Array.from(this.processes.values())
  }

  // ---- private helpers ------------------------------------------------------

  private async spawnProcess(modelId: string): Promise<TeiProcess> {
    const port = this.portPool.allocate()
    const binaryPath = this.findBinary()

    const subprocess = this.spawnFn(
      [binaryPath, '--model-id', modelId, '--port', String(port)],
      { stdout: 'pipe', stderr: 'pipe' },
    )

    const proc: InternalProcess = {
      modelId,
      port,
      state: 'starting' as TeiProcessState,
      subprocess,
      idleTimer: null,
      readyResolvers: [],
      readyRejectors: [],
    }

    this.processes.set(modelId, proc)

    // Listen for unexpected exit
    subprocess.exited.then((code) => {
      const current = this.processes.get(modelId)
      if (current && current.state === 'ready') {
        current.state = 'crashed'
        this.clearIdleTimer(current)
      }
      else if (current && current.state === 'starting') {
        // Health check will handle the timeout / rejection
        current.state = 'crashed'
        const err = new Error(`Process for ${modelId} exited with code ${code} before becoming ready`)
        current.readyRejectors.forEach(reject => reject(err))
        current.readyResolvers = []
        current.readyRejectors = []
      }
    }).catch(() => {
      // ignore — exit listener
    })

    try {
      await this.waitForHealthy(proc)
    }
    catch (err) {
      // Cleanup on health check failure
      this.clearIdleTimer(proc)
      if (proc.subprocess) {
        proc.subprocess.kill()
      }
      this.portPool.release(port)
      this.processes.delete(modelId)
      throw err
    }

    proc.state = 'ready'
    this.resetIdleTimer(proc)

    // Resolve any waiters
    proc.readyResolvers.forEach(resolve => resolve(proc))
    proc.readyResolvers = []
    proc.readyRejectors = []

    return proc
  }

  private waitForReady(proc: InternalProcess): Promise<TeiProcess> {
    return new Promise<TeiProcess>((resolve, reject) => {
      proc.readyResolvers.push(resolve)
      proc.readyRejectors.push(reject)
    })
  }

  private async waitForHealthy(proc: InternalProcess): Promise<void> {
    const { healthCheckIntervalMs, healthCheckTimeoutMs } = this.options
    const deadline = Date.now() + healthCheckTimeoutMs
    const url = `http://localhost:${proc.port}/health`

    while (Date.now() < deadline) {
      try {
        const res = await this.fetchFn(url)
        if (res.ok)
          return
      }
      catch {
        // fetch failed (connection refused) — keep polling
      }

      await sleep(healthCheckIntervalMs)
    }

    throw new Error(`Health check timed out for model ${proc.modelId} on port ${proc.port}`)
  }

  private resetIdleTimer(proc: InternalProcess): void {
    this.clearIdleTimer(proc)
    proc.idleTimer = setTimeout(() => {
      this.stop(proc.modelId).catch(() => {
        // ignore stop errors during idle timeout
      })
    }, this.options.idleTimeoutMs)
  }

  private clearIdleTimer(proc: InternalProcess): void {
    if (proc.idleTimer !== null) {
      clearTimeout(proc.idleTimer)
      proc.idleTimer = null
    }
  }
}

// ---- utilities --------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
