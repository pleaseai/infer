import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'
import { parseCliArgs, resolveConfig } from './cli'

describe('parseCliArgs', () => {
  it('parses defaults', () => {
    const args = parseCliArgs(['start'])
    expect(args.command).toBe('start')
    expect(args.port).toBeUndefined()
    expect(args.config).toBeUndefined()
  })

  it('parses --port and --config', () => {
    const args = parseCliArgs(['start', '--port', '4242', '--config', '/tmp/c.yaml'])
    expect(args.port).toBe(4242)
    expect(args.config).toBe('/tmp/c.yaml')
  })

  it('parses -p and -c shorthand', () => {
    const args = parseCliArgs(['start', '-p', '5000', '-c', './c.yaml'])
    expect(args.port).toBe(5000)
    expect(args.config).toBe('./c.yaml')
  })

  it('throws on unknown flag', () => {
    expect(() => parseCliArgs(['start', '--mystery'])).toThrow(/unknown/i)
  })

  it('throws on non-numeric --port', () => {
    expect(() => parseCliArgs(['start', '--port', 'abc'])).toThrow(/port/i)
  })

  it('returns help command for --help', () => {
    expect(parseCliArgs(['--help']).command).toBe('help')
    expect(parseCliArgs(['-h']).command).toBe('help')
  })

  it('defaults to help when no command provided', () => {
    expect(parseCliArgs([]).command).toBe('help')
  })
})

describe('resolveConfig', () => {
  it('returns bare defaults when no config file is provided and no models', () => {
    const cfg = resolveConfig({ command: 'start' })
    expect(cfg.server.port).toBe(3141)
    expect(cfg.models).toEqual([])
  })

  it('loads from a YAML file when --config is provided', () => {
    const dir = mkdtempSync(join(tmpdir(), 'inferplease-'))
    const path = join(dir, 'cfg.yaml')
    try {
      writeFileSync(path, 'server:\n  port: 4242\nmodels: []\n')
      const cfg = resolveConfig({ command: 'start', config: path })
      expect(cfg.server.port).toBe(4242)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('--port overrides config file port', () => {
    const dir = mkdtempSync(join(tmpdir(), 'inferplease-'))
    const path = join(dir, 'cfg.yaml')
    try {
      writeFileSync(path, 'server:\n  port: 4242\nmodels: []\n')
      const cfg = resolveConfig({ command: 'start', config: path, port: 9999 })
      expect(cfg.server.port).toBe(9999)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('throws when --config file does not exist', () => {
    expect(() => resolveConfig({ command: 'start', config: '/nonexistent/x.yaml' })).toThrow()
  })
})
