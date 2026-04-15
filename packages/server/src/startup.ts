import type { Arch } from '@pleaseai/infer-tei'
import type { Config } from './config'

/**
 * Map Node `process.platform` + `process.arch` to the `Arch` strings used by
 * the TEI image resolver. Unknown combinations collapse to `'unknown'` which
 * the resolver treats as `linux-x64` for CPU fallback purposes.
 */
export function resolveArch(platform: NodeJS.Platform, nodeArch: string): Arch {
  if (platform === 'darwin')
    return nodeArch === 'arm64' ? 'darwin-arm64' : 'darwin-x64'
  if (platform === 'linux')
    return nodeArch === 'arm64' ? 'linux-arm64' : 'linux-x64'
  return 'unknown'
}

export interface StartupBannerInput {
  host: string
  port: number
  modelCount: number
  authEnabled: boolean
  runtimeLogLines: string[]
}

/**
 * Compose the multi-line startup banner printed to stdout on `infer start`.
 *
 * Runtime log lines come from `selectRuntime()` so the banner surfaces
 * (a) which runtime mode was chosen, (b) the resolved image reference for
 * docker mode, and (c) any experimental-variant warnings.
 */
export function formatStartupBanner(input: StartupBannerInput): string {
  const { host, port, modelCount, authEnabled, runtimeLogLines } = input
  const lines: string[] = []
  lines.push(`infer listening on http://${host}:${port}`)
  for (const line of runtimeLogLines) lines.push(`  ${line}`)
  lines.push(`  models: ${modelCount} registered`)
  lines.push(`  auth:   ${authEnabled ? 'on' : 'off'}`)
  return `${lines.join('\n')}\n`
}

/**
 * Extract the TEI runtime configuration subset expected by `selectRuntime`.
 * Narrowing here keeps the server config schema and the TEI runtime input
 * decoupled (no circular type dep).
 */
export function teiRuntimeConfigOf(config: Config): { runtime: 'native' | 'docker' | 'auto', imageTag: string, image: string | undefined } {
  return {
    runtime: config.tei.runtime,
    imageTag: config.tei.imageTag,
    image: config.tei.image,
  }
}
