import type {
  PortRange,
  RuntimeResolution,
} from './index'
import { describe, expect, it, mock } from 'bun:test'
import {
  createTeiManager,
  findTeiBinary,
  PortPool,
  TeiClient,
  TeiManager,
} from './index'

describe('barrel index exports', () => {
  it('exports TeiManager class', () => {
    expect(TeiManager).toBeDefined()
    expect(typeof TeiManager).toBe('function')
  })

  it('exports TeiClient class', () => {
    expect(TeiClient).toBeDefined()
    expect(typeof TeiClient).toBe('function')
  })

  it('exports PortPool class', () => {
    expect(PortPool).toBeDefined()
    expect(typeof PortPool).toBe('function')
  })

  it('exports findTeiBinary function', () => {
    expect(findTeiBinary).toBeDefined()
    expect(typeof findTeiBinary).toBe('function')
  })

  it('exports createTeiManager factory function', () => {
    expect(createTeiManager).toBeDefined()
    expect(typeof createTeiManager).toBe('function')
  })
})

describe('createTeiManager', () => {
  it('returns a TeiManager instance with no options', () => {
    const manager = createTeiManager()
    expect(manager).toBeInstanceOf(TeiManager)
  })

  it('returns a TeiManager instance with partial options', () => {
    const manager = createTeiManager({ idleTimeoutMs: 60_000 })
    expect(manager).toBeInstanceOf(TeiManager)
  })

  it('accepts runtime resolution in docker mode', () => {
    const runtime: RuntimeResolution = {
      mode: 'docker',
      spawnFn: mock(() => ({ kill: () => {}, exited: Promise.resolve(0) })),
      findBinary: () => 'docker',
      imageRef: 'ghcr.io/huggingface/text-embeddings-inference:cpu-1.9',
      logLines: [],
    }
    const manager = createTeiManager({}, runtime)
    expect(manager).toBeInstanceOf(TeiManager)
    expect(manager.getProcesses()).toEqual([])
  })

  it('accepts runtime resolution in native mode', () => {
    const runtime: RuntimeResolution = {
      mode: 'native',
      spawnFn: mock(() => ({ kill: () => {}, exited: Promise.resolve(0) })),
      findBinary: () => '/usr/local/bin/text-embeddings-router',
      imageRef: undefined,
      logLines: [],
    }
    const manager = createTeiManager({}, runtime)
    expect(manager).toBeInstanceOf(TeiManager)
  })

  it('wires runtime spawnFn so that spawnProcess invokes it', async () => {
    const spawnFn = mock(() => ({
      kill: () => {},
      exited: Promise.resolve(0),
    }))
    const runtime: RuntimeResolution = {
      mode: 'docker',
      spawnFn,
      findBinary: () => 'docker',
      imageRef: 'ghcr.io/huggingface/text-embeddings-inference:cpu-1.9',
      logLines: [],
    }
    const manager = createTeiManager(
      {
        portRangeStart: 38080,
        portRangeEnd: 38081,
        healthCheckIntervalMs: 10,
        healthCheckTimeoutMs: 50,
      },
      runtime,
    )
    try {
      await manager.ensureRunning('test/model')
    }
    catch { /* expected: health check times out since spawnFn is a stub */ }
    expect(spawnFn.mock.calls.length).toBeGreaterThan(0)
  })
})

describe('type exports', () => {
  it('PortRange type can be used to construct a PortPool', () => {
    const range: PortRange = { start: 9000, end: 9010 }
    const pool = new PortPool(range)
    const port = pool.allocate()
    expect(port).toBeGreaterThanOrEqual(9000)
    expect(port).toBeLessThanOrEqual(9010)
  })
})
