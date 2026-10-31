import { canTransition, isTermClosed, TERM_PROJECT_POLICY, TERM_TRANSITIONS } from './term-policy'

const STATUSES = ['PLANNING', 'ADJUSTMENTS', 'STARTED', 'FINISHED', 'CANCELLED'] as const

describe('term-policy', () => {
  it('TERM_TRANSITIONS é exatamente a tabela da spec', () => {
    expect(TERM_TRANSITIONS).toEqual({
      PLANNING: ['ADJUSTMENTS', 'CANCELLED'],
      ADJUSTMENTS: ['PLANNING', 'STARTED', 'CANCELLED'],
      STARTED: ['ADJUSTMENTS', 'FINISHED', 'CANCELLED'],
      FINISHED: [],
      CANCELLED: [],
    })
  })

  it('TERM_PROJECT_POLICY é exatamente a matriz da spec', () => {
    expect(TERM_PROJECT_POLICY).toEqual({
      PLANNING: { create: true, edit: 'MANAGERS', publish: true, othersSee: 'NONE' },
      ADJUSTMENTS: { create: false, edit: 'MANAGERS', publish: true, othersSee: 'PUBLISHED' },
      STARTED: { create: false, edit: 'UNIT_ADMINS', publish: false, othersSee: 'PUBLISHED' },
      FINISHED: { create: false, edit: 'NOBODY', publish: false, othersSee: 'PUBLISHED' },
      CANCELLED: { create: false, edit: 'NOBODY', publish: false, othersSee: 'NONE' },
    })
  })

  it('para o mesmo status nunca é transição', () => {
    for (const status of STATUSES) expect(canTransition(status, status)).toBe(false)
  })

  it('só FINISHED e CANCELLED são fechados', () => {
    expect(STATUSES.filter(isTermClosed)).toEqual(['FINISHED', 'CANCELLED'])
  })
})
