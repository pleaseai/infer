import type { Config } from './config'
import { loadConfigFromFile, parseConfig } from './config'

export type Command = 'start' | 'help'

export interface CliArgs {
  command: Command
  port?: number
  config?: string
}

export function parseCliArgs(argv: string[]): CliArgs {
  if (argv.length === 0)
    return { command: 'help' }

  const [first, ...rest] = argv

  if (first === '-h' || first === '--help')
    return { command: 'help' }

  if (first !== 'start')
    throw new Error(`Unknown command: ${first}. Try 'start' or '--help'.`)

  const args: CliArgs = { command: 'start' }
  let i = 0
  while (i < rest.length) {
    const flag = rest[i]
    const value = rest[i + 1]
    switch (flag) {
      case '--port':
      case '-p': {
        const n = Number(value)
        if (!Number.isInteger(n) || n < 1 || n > 65535)
          throw new Error(`Invalid --port value: ${value}`)
        args.port = n
        i += 2
        break
      }
      case '--config':
      case '-c':
        if (!value)
          throw new Error('--config requires a path')
        args.config = value
        i += 2
        break
      default:
        throw new Error(`Unknown flag: ${flag}`)
    }
  }
  return args
}

export function resolveConfig(args: CliArgs): Config {
  const base = args.config != null
    ? loadConfigFromFile(args.config)
    : parseConfig({ models: [] })

  if (args.port != null) {
    return { ...base, server: { ...base.server, port: args.port } }
  }
  return base
}

export const HELP_TEXT = `infer — local OpenAI-compatible inference gateway

Usage:
  infer start [--port <port>] [--config <path>]
  infer --help

Options:
  -p, --port <port>    Port to bind (default 3141, overrides config)
  -c, --config <path>  Path to infer.yaml
  -h, --help           Show this help
`
