import { assignSubscriptionSchema } from './subscription.schemas'

const paths = (input: unknown) => {
  const result = assignSubscriptionSchema.safeParse(input)
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
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
  })

  it('recusa GRACE com data', () => {
    expect(paths({ plan: 'GRACE' })).toEqual([])
    expect(paths({ plan: 'GRACE', expiresAt: tomorrow })).toEqual(['expiresAt'])
  })

  it('recusa BASIC e PRO, que não estão no enum', () => {
    expect(paths({ plan: 'BASIC' })).toEqual(['plan'])
    expect(paths({ plan: 'PRO' })).toEqual(['plan'])
  })
})
