import { describe, expect, it } from 'bun:test'
import { parseConfig } from './config'
import { formatStartupBanner, resolveArch, teiRuntimeConfigOf } from './startup'

describe('resolveArch', () => {
  it('maps darwin + arm64 → darwin-arm64', () => {
    expect(resolveArch('darwin', 'arm64')).toBe('darwin-arm64')
  })

  it('maps darwin + x64 → darwin-x64', () => {
    expect(resolveArch('darwin', 'x64')).toBe('darwin-x64')
  })

  it('maps linux + x64 → linux-x64', () => {
    expect(resolveArch('linux', 'x64')).toBe('linux-x64')
  })

  it('maps linux + arm64 → linux-arm64', () => {
    expect(resolveArch('linux', 'arm64')).toBe('linux-arm64')
  })

  it('maps win32 or unknown platforms → unknown', () => {
    expect(resolveArch('win32', 'x64')).toBe('unknown')
    expect(resolveArch('freebsd' as NodeJS.Platform, 'x64')).toBe('unknown')
  })

  it('maps non-x64/arm64 archs to unknown (does NOT coerce to x64)', () => {
    // ia32, ppc64le, s390x etc. are real Node arch values that TEI does not
    // publish images for. Silently using linux-x64 would pull the wrong binary.
    expect(resolveArch('linux', 'ia32')).toBe('unknown')
    expect(resolveArch('linux', 'ppc64le')).toBe('unknown')
    expect(resolveArch('linux', 's390x')).toBe('unknown')
    expect(resolveArch('darwin', 'ia32')).toBe('unknown')
  })
})

describe('formatStartupBanner', () => {
  it('includes listening line, models count, and auth flag', () => {
    const banner = formatStartupBanner({
      host: '127.0.0.1',
      port: 3141,
      modelCount: 2,
      authEnabled: false,
      runtimeLogLines: [],
    })
    expect(banner).toContain('infer listening on http://127.0.0.1:3141')
    expect(banner).toContain('models: 2 registered')
    expect(banner).toContain('auth:   off')
  })

  it('shows auth on when authEnabled', () => {
    const banner = formatStartupBanner({
      host: '0.0.0.0',
      port: 8080,
      modelCount: 0,
      authEnabled: true,
      runtimeLogLines: [],
    })
    expect(banner).toContain('auth:   on')
  })

  it('interleaves runtime log lines between listening and models', () => {
    const banner = formatStartupBanner({
      host: '127.0.0.1',
      port: 3141,
      modelCount: 1,
      authEnabled: false,
      runtimeLogLines: [
        'tei: runtime=docker image=ghcr.io/huggingface/text-embeddings-inference:89-1.9 (compute capability 8.9)',
      ],
    })
    expect(banner).toContain('tei: runtime=docker image=ghcr.io/huggingface/text-embeddings-inference:89-1.9')
    // runtime line appears before models line
    const idxRuntime = banner.indexOf('tei: runtime=docker')
    const idxModels = banner.indexOf('models: 1')
    expect(idxRuntime).toBeGreaterThan(-1)
    expect(idxModels).toBeGreaterThan(idxRuntime)
  })

  it('renders experimental warning line when runtime reports it', () => {
    const banner = formatStartupBanner({
      host: '127.0.0.1',
      port: 3141,
      modelCount: 1,
      authEnabled: false,
      runtimeLogLines: [
        'tei: runtime=docker image=ghcr.io/huggingface/text-embeddings-inference:turing-1.9 (compute capability 7.5 (experimental variant))',
        'tei: warning — using experimental TEI image variant. Behavior may change between releases.',
      ],
    })
    expect(banner).toContain('experimental')
  })

  it('renders native mode line', () => {
    const banner = formatStartupBanner({
      host: '127.0.0.1',
      port: 3141,
      modelCount: 0,
      authEnabled: false,
      runtimeLogLines: ['tei: runtime=native (text-embeddings-router)'],
    })
    expect(banner).toContain('tei: runtime=native')
  })
})

describe('teiRuntimeConfigOf', () => {
  it('narrows Config to the TEI runtime-relevant fields', () => {
    const cfg = parseConfig({ tei: { runtime: 'docker', imageTag: '1.8' }, models: [] })
    const narrowed = teiRuntimeConfigOf(cfg)
    expect(narrowed).toEqual({ runtime: 'docker', imageTag: '1.8', image: undefined })
  })

  it('passes through tei.image override', () => {
    const cfg = parseConfig({
      tei: { image: 'ghcr.io/huggingface/text-embeddings-inference@sha256:abc' },
      models: [],
    })
    const narrowed = teiRuntimeConfigOf(cfg)
    expect(narrowed.image).toBe('ghcr.io/huggingface/text-embeddings-inference@sha256:abc')
  })
})
