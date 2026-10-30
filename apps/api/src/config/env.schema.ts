import { z } from 'zod'

// Só o que a app lê hoje. Variável nova entra aqui com a spec que passar a usá-la.
export const envSchema = z.object({
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
