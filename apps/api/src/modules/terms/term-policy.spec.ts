import {
  canTransition,
  isProjectActionAllowed,
  isProjectActionOpen,
  isProjectVisible,
  isTermClosed,
  TERM_PROJECT_POLICY,
  TERM_TRANSITIONS,
} from './term-policy'

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

describe('isProjectActionAllowed e isProjectVisible', () => {
  const ACTIONS = ['create', 'edit', 'publish', 'delete'] as const
  const ROLES = [
    { isProjectManager: true, canManageTerm: true },
    { isProjectManager: true, canManageTerm: false },
    { isProjectManager: false, canManageTerm: false },
  ]

  it('a ação só é permitida quando está aberta no status', () => {
    for (const status of STATUSES) {
      for (const action of ACTIONS) {
        for (const roles of ROLES) {
          if (!isProjectActionOpen(status, action)) {
            expect(isProjectActionAllowed(status, action, roles)).toBe(false)
          }
        }
      }
    }
  })

  it('em STARTED, editar é de dono e responsável, não do coordenador', () => {
    expect(isProjectActionAllowed('STARTED', 'edit', ROLES[0])).toBe(true)
    expect(isProjectActionAllowed('STARTED', 'edit', ROLES[1])).toBe(false)
  })

  it.each([
    ['PLANNING', false, false],
    ['ADJUSTMENTS', false, true],
    ['STARTED', false, true],
    ['FINISHED', false, true],
    ['CANCELLED', false, false],
  ] as const)('%s: os demais veem rascunho %p, publicado %p', (status, draft, published) => {
    expect(isProjectVisible(status, 'DRAFT', false)).toBe(draft)
    expect(isProjectVisible(status, 'PUBLISHED', false)).toBe(published)
    expect(isProjectVisible(status, 'DRAFT', true)).toBe(true)
    expect(isProjectVisible(status, 'PUBLISHED', true)).toBe(true)
  })
})
