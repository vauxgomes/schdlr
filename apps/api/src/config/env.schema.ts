import { z } from 'zod'

// Variável vazia no .env (`MAIL_USER=`) conta como ausente.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional())

// Só o que a app lê hoje. Variável nova entra aqui com a spec que passar a usá-la.
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_URL: z.url(),
    CORS_ORIGIN: z.url(),
    JWT_SECRET: z.string().min(32),
    // Formato do `ms`, que é o que o jsonwebtoken aceita: 900, 15m, 12h, 7d.
    JWT_EXPIRES_IN: z
      .string()
      .regex(/^\d+(ms|s|m|h|d|w|y)?$/, 'Use um número seguido de ms, s, m, h, d, w ou y')
      .default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
    // `stringbool`, não `coerce.boolean`: o coerce lê a string "false" como true.
    MAIL_ENABLED: z.stringbool().default(false),
    MAIL_FROM: z.string().min(1),
    MAIL_USER: optional(z.email()),
    // A senha de app do Google vem em quatro grupos separados por espaço.
    MAIL_PASS: optional(z.string()),
  })
  .superRefine((env, ctx) => {
    if (!env.MAIL_ENABLED) return
    for (const key of ['MAIL_USER', 'MAIL_PASS'] as const) {
      if (!env[key]) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'Obrigatória com MAIL_ENABLED=true' })
      }
    }
  })

export type Env = z.infer<typeof envSchema>

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config)
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
    throw new Error(`Variáveis de ambiente inválidas:\n${lines.join('\n')}`)
  }
  return result.data
}
