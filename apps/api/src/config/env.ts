import { z } from 'zod'

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:3000'),
  // Onde mora a UI, para montar links de e-mail. Não se confunde com
  // CORS_ORIGIN, que responde outra pergunta: quem pode chamar esta API.
  WEB_APP_URL: z.string().min(1).default('http://localhost:3000'),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().min(1).default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  UNIT_INVITE_TTL_DAYS: z.coerce.number().int().positive().default(7),

  // SMTP_HOST ausente é um estado válido: sem ele o envio só loga.
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  // z.coerce.boolean() transformaria a string 'false' em true.
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  MAIL_FROM: z.string().min(1).default('schdlr <no-reply@schdlr.local>'),
})

export type Env = z.infer<typeof EnvSchema>

export function validateEnv(config: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(config)

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')

    throw new Error(`Invalid environment:\n${details}`)
  }

  return result.data
}
