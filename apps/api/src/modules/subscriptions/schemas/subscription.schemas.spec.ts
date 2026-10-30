import { assignSubscriptionSchema } from './subscription.schemas'

const paths = (input: unknown) => {
  const result = assignSubscriptionSchema.safeParse(input)
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
}

// O código da regra própria, que o ZodValidationPipe põe no item do erro.
const customCodes = (input: unknown): unknown[] => {
  const result = assignSubscriptionSchema.safeParse(input)
  return result.success
    ? []
    : result.error.issues.map((issue): unknown =>
        issue.code === 'custom' ? issue.params?.code : undefined,
      )
}

describe('assignSubscriptionSchema', () => {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString()
  const yesterday = new Date(Date.now() - 86_400_000).toISOString()

  it('aceita TRIAL com ou sem data futura', () => {
    expect(paths({ plan: 'TRIAL' })).toEqual([])
    expect(paths({ plan: 'TRIAL', expiresAt: tomorrow })).toEqual([])
  })

  it('recusa TRIAL com data no passado', () => {
    expect(paths({ plan: 'TRIAL', expiresAt: yesterday })).toEqual(['expiresAt'])
    expect(customCodes({ plan: 'TRIAL', expiresAt: yesterday })).toEqual(['DATE_NOT_IN_FUTURE'])
  })

  it('recusa GRACE com data', () => {
    expect(paths({ plan: 'GRACE' })).toEqual([])
    expect(paths({ plan: 'GRACE', expiresAt: tomorrow })).toEqual(['expiresAt'])
    expect(customCodes({ plan: 'GRACE', expiresAt: tomorrow })).toEqual(['GRACE_DOES_NOT_EXPIRE'])
  })

  it('recusa BASIC e PRO, que não estão no enum', () => {
    expect(paths({ plan: 'BASIC' })).toEqual(['plan'])
    expect(paths({ plan: 'PRO' })).toEqual(['plan'])
  })
})
