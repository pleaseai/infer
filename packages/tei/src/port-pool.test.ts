import { describe, expect, it } from 'bun:test'
import { PortPool } from './port-pool'

describe('PortPool', () => {
  it('allocates a port from the configured range', () => {
    const pool = new PortPool({ start: 8080, end: 8082 })
    const port = pool.allocate()
    expect(port).toBeGreaterThanOrEqual(8080)
    expect(port).toBeLessThanOrEqual(8082)
  })

  it('allocates different ports on consecutive calls', () => {
    const pool = new PortPool({ start: 8080, end: 8082 })
    const port1 = pool.allocate()
    const port2 = pool.allocate()
    expect(port1).not.toBe(port2)
  })

  it('releases a port back to the pool for reuse', () => {
    const pool = new PortPool({ start: 8080, end: 8080 })
    const port = pool.allocate()
    pool.release(port)
    const reused = pool.allocate()
    expect(reused).toBe(port)
  })

  it('throws when all ports are exhausted', () => {
    const pool = new PortPool({ start: 8080, end: 8081 })
    pool.allocate()
    pool.allocate()
    expect(() => pool.allocate()).toThrow('No available ports')
  })

  it('prevents double-release of a port', () => {
    const pool = new PortPool({ start: 8080, end: 8082 })
    const port = pool.allocate()
    pool.release(port)
    expect(() => pool.release(port)).toThrow('Port is not allocated')
  })
})
