import type {
  PortRange,
} from './index'
import { describe, expect, it } from 'bun:test'
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
