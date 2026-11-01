import { isEmptyCell, putBoardSlotSchema } from './board-slot.schemas'

describe('putBoardSlotSchema', () => {
  it.each([
    ['oferta e local', { offeringId: 'o', locationId: 'l', isBlocked: false }],
    ['só oferta', { offeringId: 'o', locationId: null, isBlocked: false }],
    ['só local', { offeringId: null, locationId: 'l', isBlocked: false }],
    ['bloqueada vazia', { offeringId: null, locationId: null, isBlocked: true }],
    ['vazia', { offeringId: null, locationId: null, isBlocked: false }],
  ])('%s é válido', (_label, cell) => {
    expect(putBoardSlotSchema.parse(cell)).toEqual(cell)
  })

  it('os três campos são obrigatórios', () => {
    expect(putBoardSlotSchema.safeParse({ offeringId: 'o', isBlocked: false }).success).toBe(false)
    expect(putBoardSlotSchema.safeParse({ offeringId: null, locationId: null }).success).toBe(false)
  })

  it.each([
    ['oferta', { offeringId: 'o', locationId: null }],
    ['local', { offeringId: null, locationId: 'l' }],
  ])('bloqueada com %s é BLOCKED_SLOT_MUST_BE_EMPTY', (_label, cell) => {
    const result = putBoardSlotSchema.safeParse({ ...cell, isBlocked: true })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({
      path: ['isBlocked'],
      params: { code: 'BLOCKED_SLOT_MUST_BE_EMPTY' },
    })
  })
})

describe('isEmptyCell', () => {
  it('só sem oferta, sem local e desbloqueada', () => {
    expect(isEmptyCell({ offeringId: null, locationId: null, isBlocked: false })).toBe(true)
    expect(isEmptyCell({ offeringId: null, locationId: null, isBlocked: true })).toBe(false)
    expect(isEmptyCell({ offeringId: null, locationId: 'l', isBlocked: false })).toBe(false)
  })
})
