import { describe, expect, it } from 'bun:test'
import type {
  EmbedRequest,
  EmbedResponse,
  RerankRequest,
  RerankResponse,
  TeiClientOptions,
  TeiManagerOptions,
  TeiProcess,
  TeiProcessState,
} from './types'

describe('TeiProcessState', () => {
  it('should accept valid states', () => {
    const states: TeiProcessState[] = [
      'starting',
      'ready',
      'stopping',
      'stopped',
      'crashed',
    ]
    expect(states).toHaveLength(5)
  })
})

describe('TeiProcess', () => {
  it('should have required fields', () => {
    const process: TeiProcess = {
      modelId: 'BAAI/bge-small-en-v1.5',
      port: 8080,
      state: 'starting',
      subprocess: null,
      idleTimer: null,
    }
    expect(process.modelId).toBe('BAAI/bge-small-en-v1.5')
    expect(process.port).toBe(8080)
    expect(process.state).toBe('starting')
    expect(process.subprocess).toBeNull()
    expect(process.idleTimer).toBeNull()
  })
})

describe('TeiManagerOptions', () => {
  it('should have port range and timeout config', () => {
    const options: TeiManagerOptions = {
      portRangeStart: 9000,
      portRangeEnd: 9100,
      idleTimeoutMs: 60000,
      healthCheckIntervalMs: 500,
      healthCheckTimeoutMs: 30000,
    }
    expect(options.portRangeStart).toBe(9000)
    expect(options.portRangeEnd).toBe(9100)
    expect(options.idleTimeoutMs).toBe(60000)
    expect(options.healthCheckIntervalMs).toBe(500)
    expect(options.healthCheckTimeoutMs).toBe(30000)
  })

  it('should allow partial options', () => {
    const options: Partial<TeiManagerOptions> = {
      portRangeStart: 9000,
    }
    expect(options.portRangeStart).toBe(9000)
  })
})

describe('EmbedRequest', () => {
  it('should accept single string input', () => {
    const req: EmbedRequest = {
      inputs: 'hello world',
    }
    expect(req.inputs).toBe('hello world')
  })

  it('should accept array of strings', () => {
    const req: EmbedRequest = {
      inputs: ['hello', 'world'],
      normalize: true,
      truncate: false,
    }
    expect(Array.isArray(req.inputs)).toBe(true)
    expect(req.normalize).toBe(true)
    expect(req.truncate).toBe(false)
  })
})

describe('EmbedResponse', () => {
  it('should be array of float arrays', () => {
    const res: EmbedResponse = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]
    expect(res).toHaveLength(2)
    expect(res[0]).toHaveLength(3)
  })
})

describe('RerankRequest', () => {
  it('should have query and texts', () => {
    const req: RerankRequest = {
      query: 'what is machine learning',
      texts: ['ML is a field of AI', 'cats are cute'],
    }
    expect(req.query).toBe('what is machine learning')
    expect(req.texts).toHaveLength(2)
  })

  it('should accept optional raw_scores and return_text', () => {
    const req: RerankRequest = {
      query: 'test',
      texts: ['a', 'b'],
      raw_scores: true,
      return_text: true,
    }
    expect(req.raw_scores).toBe(true)
    expect(req.return_text).toBe(true)
  })
})

describe('RerankResponse', () => {
  it('should be array with index and score', () => {
    const res: RerankResponse = [
      { index: 0, score: 0.95 },
      { index: 1, score: 0.42 },
    ]
    expect(res[0].index).toBe(0)
    expect(res[0].score).toBe(0.95)
    expect(res[0].text).toBeUndefined()
  })

  it('should support optional text field', () => {
    const res: RerankResponse = [
      { index: 0, score: 0.95, text: 'ML is a field of AI' },
    ]
    expect(res[0].text).toBe('ML is a field of AI')
  })
})

describe('TeiClientOptions', () => {
  it('should have baseUrl', () => {
    const options: TeiClientOptions = {
      baseUrl: 'http://localhost:8080',
    }
    expect(options.baseUrl).toBe('http://localhost:8080')
  })
})
