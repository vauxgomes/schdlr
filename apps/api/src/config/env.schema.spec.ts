import { envSchema } from './env.schema'

const base = {
  DATABASE_URL: 'postgresql://schdlr:schdlr@localhost:5434/schdlr',
  CORS_ORIGIN: 'http://localhost:3000',
  JWT_SECRET: 'x'.repeat(32),
  MAIL_FROM: 'noreply@schdlr.test',
}

function failingPaths(env: Record<string, string>) {
  const result = envSchema.safeParse(env)
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
}

describe('envSchema — e-mail', () => {
  it('lê MAIL_ENABLED="false" como false', () => {
    expect(envSchema.parse({ ...base, MAIL_ENABLED: 'false' }).MAIL_ENABLED).toBe(false)
  })

  it('aceita MAIL_USER e MAIL_PASS vazios com o envio desligado', () => {
    const env = envSchema.parse({ ...base, MAIL_ENABLED: 'false', MAIL_USER: '', MAIL_PASS: '' })
    expect(env.MAIL_USER).toBeUndefined()
    expect(env.MAIL_PASS).toBeUndefined()
  })

  it('exige MAIL_USER e MAIL_PASS com o envio ligado', () => {
    expect(failingPaths({ ...base, MAIL_ENABLED: 'true', MAIL_USER: '', MAIL_PASS: '' })).toEqual([
      'MAIL_USER',
      'MAIL_PASS',
    ])
  })

  it('aceita senha de app com espaços', () => {
    const env = envSchema.parse({
      ...base,
      MAIL_ENABLED: 'true',
      MAIL_USER: 'conta@gmail.com',
      MAIL_PASS: 'abcd efgh ijkl mnop',
    })
    expect(env.MAIL_PASS).toBe('abcd efgh ijkl mnop')
  })
})
