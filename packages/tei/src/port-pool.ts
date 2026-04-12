export interface PortRange {
  start: number
  end: number
}

export class PortPool {
  private readonly available: Set<number>
  private readonly allocated: Set<number>

  constructor(range: PortRange) {
    this.available = new Set()
    this.allocated = new Set()

    for (let port = range.start; port <= range.end; port++) {
      this.available.add(port)
    }
  }

  allocate(): number {
    const port = this.available.values().next().value
    if (port === undefined) {
      throw new Error('No available ports in pool')
    }
    this.available.delete(port)
    this.allocated.add(port)
    return port
  }

  release(port: number): void {
    if (!this.allocated.has(port)) {
      throw new Error('Port is not allocated')
    }
    this.allocated.delete(port)
    this.available.add(port)
  }
}
