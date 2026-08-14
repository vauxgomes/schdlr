import { validateEnv } from './env'

describe('validateEnv', () => {
  const valid = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5434/db',
    JWT_SECRET: 'a'.repeat(32),
  }

  it('fails when DATABASE_URL is missing', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/)
  })

  it('fails when JWT_SECRET is missing', () => {
    expect(() => validateEnv({ DATABASE_URL: valid.DATABASE_URL })).toThrow(/JWT_SECRET/)
  })

  it('refuses a JWT_SECRET shorter than 32 characters', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/)
  })

  it('names every offending variable in the message', () => {
    expect(() => validateEnv({ ...valid, PORT: 'abc' })).toThrow(/PORT/)
  })

  it('applies defaults for the optional variables', () => {
    const env = validateEnv(valid)

    expect(env.NODE_ENV).toBe('development')
    expect(env.PORT).toBe(3001)
    expect(env.CORS_ORIGIN).toBe('http://localhost:3000')
    expect(env.JWT_EXPIRES_IN).toBe('15m')
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(7)
  })

  it('coerces PORT to a number', () => {
    expect(validateEnv({ ...valid, PORT: '4000' }).PORT).toBe(4000)
  })

  it('rejects an unknown NODE_ENV', () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/)
  })
})
