import { readFileSync } from 'node:fs'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

export const modelTypeSchema = z.enum(['embedding', 'rerank', 'chat'])
export type ModelType = z.infer<typeof modelTypeSchema>

export const backendSchema = z.enum(['tei', 'llama'])
export type Backend = z.infer<typeof backendSchema>

export const modelEntrySchema = z.object({
  id: z.string().min(1),
  type: modelTypeSchema,
  backend: backendSchema,
  repo_id: z.string().min(1),
}).passthrough()

export type ModelEntry = z.infer<typeof modelEntrySchema>

export const serverSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3141),
  host: z.string().min(1).default('127.0.0.1'),
}).default({ port: 3141, host: '127.0.0.1' })

export const authSchema = z.object({
  token: z.string().min(1),
}).optional()

export const configSchema = z.object({
  server: serverSchema,
  auth: authSchema,
  models: z.array(modelEntrySchema).superRefine((models, ctx) => {
    const seen = new Set<string>()
    for (const m of models) {
      if (seen.has(m.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['models'],
          message: `Duplicate model id: ${m.id}`,
        })
      }
      seen.add(m.id)
    }
  }),
})

export type Config = z.infer<typeof configSchema>

export class ConfigValidationError extends Error {
  readonly issues: z.ZodIssue[]
  constructor(issues: z.ZodIssue[]) {
    super(`Invalid config: ${issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
    this.name = 'ConfigValidationError'
    this.issues = issues
  }
}

export function parseConfig(raw: unknown): Config {
  const result = configSchema.safeParse(raw)
  if (!result.success) {
    throw new ConfigValidationError(result.error.issues)
  }
  return result.data
}

export function loadConfigFromString(yamlText: string): Config {
  const raw = parseYaml(yamlText) as unknown
  return parseConfig(raw ?? {})
}

export function loadConfigFromFile(path: string): Config {
  const text = readFileSync(path, 'utf-8')
  return loadConfigFromString(text)
}
