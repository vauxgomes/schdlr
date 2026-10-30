import { createUnitSchema, isUnitReactivation, updateUnitSchema } from './unit.schemas'

describe('createUnitSchema', () => {
  it('normaliza o slug e transforma endereço vazio em null', () => {
    expect(createUnitSchema.parse({ name: ' Sede ', slug: ' SEDE-1 ', address: '  ' })).toEqual({
      name: 'Sede',
      slug: 'sede-1',
      address: null,
    })
  })

  it('recusa slug fora do formato', () => {
    expect(createUnitSchema.safeParse({ name: 'Sede', slug: 'não é slug' }).success).toBe(false)
  })
})

describe('updateUnitSchema', () => {
  it('ignora slug e chaves desconhecidas', () => {
    expect(updateUnitSchema.parse({ name: 'X', slug: 'outro', organizationId: 'o' })).toEqual({
      name: 'X',
    })
  })

  it('corpo sem campo válido é EMPTY_UPDATE', () => {
    const result = updateUnitSchema.safeParse({ slug: 'outro' })
    expect(result.success).toBe(false)
    const [issue] = result.error!.issues
    expect(issue.code === 'custom' && issue.params).toEqual({ code: 'EMPTY_UPDATE' })
  })

  it('isUnitReactivation só com isActive: true', () => {
    expect(isUnitReactivation({ isActive: true })).toBe(true)
    expect(isUnitReactivation({ isActive: true, name: 'X' })).toBe(false)
    expect(isUnitReactivation({ isActive: false })).toBe(false)
  })
})
