import type { DockerSpawnDeps } from './docker-spawn'
import { describe, expect, it, mock } from 'bun:test'
import { createDockerSpawn, hasDocker } from './docker-spawn'

const TEST_IMAGE = 'ghcr.io/huggingface/text-embeddings-inference:89-1.9'

function buildDeps(overrides: Partial<DockerSpawnDeps> = {}): DockerSpawnDeps {
  const exited = Promise.resolve(0)
  return {
    execFileSyncFn: mock(() => 'container-id-abc\n'),
    spawnFn: mock(() => ({
      stdout: { on: mock(() => {}) } as unknown as NodeJS.ReadableStream,
      on: mock((event: string, cb: (code: number) => void) => {
        if (event === 'close')
          queueMicrotask(() => cb(0))
      }),
    })) as unknown as DockerSpawnDeps['spawnFn'],
    hfCacheHost: '/home/user/.cache/huggingface',
    image: TEST_IMAGE,
    useGpu: false,
    ...overrides,
  }
}

describe('createDockerSpawn', () => {
  it('returns a SpawnFn that runs docker with correct args (CPU mode)', () => {
    const deps = buildDeps()
    const spawn = createDockerSpawn(deps)

    spawn(['/unused/binary', '--model-id', 'foo/bar', '--port', '18080'])

    expect(deps.execFileSyncFn).toHaveBeenCalledTimes(1)
    const [cmd, args] = (deps.execFileSyncFn as ReturnType<typeof mock>).mock.calls[0]!
    expect(cmd).toBe('docker')
    expect(args).toContain('run')
    expect(args).toContain('-d')
    expect(args).toContain('--rm')
    expect(args).toContain('-p')
    expect(args).toContain('18080:80')
    expect(args).toContain('-v')
    expect(args).toContain('/home/user/.cache/huggingface:/data')
    expect(args).toContain(TEST_IMAGE)
    expect(args).toContain('--model-id')
    expect(args).toContain('foo/bar')
    expect(args).toContain('--port')
    expect(args).toContain('80')
  })

  it('adds --gpus all when useGpu is true', () => {
    const deps = buildDeps({ useGpu: true })
    const spawn = createDockerSpawn(deps)
    spawn(['/unused', '--model-id', 'm', '--port', '18080'])

    const [, args] = (deps.execFileSyncFn as ReturnType<typeof mock>).mock.calls[0]!
    expect(args).toContain('--gpus')
    expect(args).toContain('all')
  })

  it('omits --gpus when useGpu is false', () => {
    const deps = buildDeps({ useGpu: false })
    const spawn = createDockerSpawn(deps)
    spawn(['/unused', '--model-id', 'm', '--port', '18080'])

    const [, args] = (deps.execFileSyncFn as ReturnType<typeof mock>).mock.calls[0]!
    expect(args).not.toContain('--gpus')
  })

  it('throws when --port is missing from cmd', () => {
    const deps = buildDeps()
    const spawn = createDockerSpawn(deps)
    expect(() => spawn(['/unused', '--model-id', 'm'])).toThrow(/--port/)
  })

  it('throws when --model-id is missing from cmd', () => {
    const deps = buildDeps()
    const spawn = createDockerSpawn(deps)
    expect(() => spawn(['/unused', '--port', '18080'])).toThrow(/--model-id/)
  })

  it('kill() calls docker stop with the container id', () => {
    const deps = buildDeps()
    const spawn = createDockerSpawn(deps)
    const proc = spawn(['/unused', '--model-id', 'm', '--port', '18080'])

    proc.kill()
    const execCalls = (deps.execFileSyncFn as ReturnType<typeof mock>).mock.calls
    const stopCall = execCalls.find(c => Array.isArray(c[1]) && (c[1] as string[]).includes('stop'))
    expect(stopCall).toBeDefined()
    expect(stopCall![1]).toContain('container-id-abc')
  })

  it('kill() swallows errors from docker stop (container may already be gone)', () => {
    const execFn = mock((cmd: string, args: string[]) => {
      if (args.includes('stop'))
        throw new Error('No such container')
      return 'container-id-abc\n'
    })
    const spawn = createDockerSpawn(buildDeps({ execFileSyncFn: execFn }))
    const proc = spawn(['/unused', '--model-id', 'm', '--port', '18080'])
    expect(() => proc.kill()).not.toThrow()
  })
})

describe('hasDocker', () => {
  it('returns true when docker info succeeds', () => {
    const execFn = mock(() => 'Server version: 24.0.0')
    expect(hasDocker(execFn)).toBe(true)
    const [cmd, args, opts] = execFn.mock.calls[0]!
    expect(cmd).toBe('docker')
    expect(args).toContain('info')
    expect((opts as { timeout?: number }).timeout).toBe(5000)
  })

  it('returns false when docker info throws', () => {
    const execFn = mock(() => {
      throw new Error('command not found: docker')
    })
    expect(hasDocker(execFn)).toBe(false)
  })

  it('returns false when docker info times out', () => {
    const execFn = mock(() => {
      throw new Error('ETIMEDOUT')
    })
    expect(hasDocker(execFn)).toBe(false)
  })
})
