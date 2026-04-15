#!/usr/bin/env bun
import process from 'node:process'
import { createTeiManager, defaultHfCacheHost, defaultSelectRuntimeInput, selectRuntime } from '@pleaseai/infer-tei'
import { buildApp, createTeiBackend } from './app'
import { HELP_TEXT, parseCliArgs, resolveConfig } from './cli'
import { formatStartupBanner, resolveArch, teiRuntimeConfigOf } from './startup'

async function main(argv: string[]): Promise<void> {
  let args
  try {
    args = parseCliArgs(argv)
  }
  catch (err) {
    process.stderr.write(`${(err as Error).message}\n\n${HELP_TEXT}`)
    process.exit(1)
  }

  if (args.command === 'help') {
    process.stdout.write(HELP_TEXT)
    return
  }

  const config = resolveConfig(args)
  const arch = resolveArch(process.platform, process.arch)
  const runtime = selectRuntime(
    defaultSelectRuntimeInput(teiRuntimeConfigOf(config), arch, defaultHfCacheHost()),
  )
  const teiManager = createTeiManager(undefined, runtime)
  const backends = { tei: createTeiBackend(teiManager) }
  const app = buildApp({ config, backends })

  const server = Bun.serve({
    port: config.server.port,
    hostname: config.server.host,
    fetch: app.fetch,
  })

  process.stdout.write(
    formatStartupBanner({
      host: server.hostname ?? config.server.host,
      port: server.port ?? config.server.port,
      modelCount: config.models.length,
      authEnabled: Boolean(config.auth?.token),
      runtimeLogLines: runtime.logLines,
    }),
  )

  const shutdown = () => {
    process.stdout.write('\nshutting down...\n')
    server.stop()
    teiManager.stopAll().then(
      () => process.exit(0),
      (err: unknown) => {
        process.stderr.write(`[shutdown] stopAll failed: ${err instanceof Error ? err.message : String(err)}\n`)
        process.exit(1)
      },
    )
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main(process.argv.slice(2)).catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
