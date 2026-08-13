import { validateEnv } from './env'

describe('validateEnv', () => {
  const valid = { DATABASE_URL: 'postgresql://user:pass@localhost:5434/db' }

  it('fails when DATABASE_URL is missing', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/)
  })

  it('names every offending variable in the message', () => {
    expect(() => validateEnv({ ...valid, PORT: 'abc' })).toThrow(/PORT/)
  })

  it('applies defaults for the optional variables', () => {
    const env = validateEnv(valid)

    expect(env.NODE_ENV).toBe('development')
    expect(env.PORT).toBe(3001)
    expect(env.CORS_ORIGIN).toBe('http://localhost:3000')
  })

  it('coerces PORT to a number', () => {
    expect(validateEnv({ ...valid, PORT: '4000' }).PORT).toBe(4000)
  })

  it('rejects an unknown NODE_ENV', () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/)
  })
})
