import { createTenantSchema, isReactivation, updateTenantSchema } from './organization.schemas'

describe('createTenantSchema', () => {
  it('normaliza o slug e transforma endereço vazio em null', () => {
    expect(createTenantSchema.parse({ name: ' Acme ', slug: ' ACME-1 ', address: '  ' })).toEqual({
      name: 'Acme',
      slug: 'acme-1',
      address: null,
    })
  })

  it.each(['a', 'x'.repeat(61), '-acme', 'acme-', 'ac--me', 'ac me', 'açme'])(
    'recusa o slug %j',
    (slug) => {
      expect(createTenantSchema.safeParse({ name: 'A', slug }).success).toBe(false)
    },
  )

  it('recusa endereço acima de 300 caracteres', () => {
    expect(
      createTenantSchema.safeParse({ name: 'A', slug: 'ab', address: 'x'.repeat(301) }).success,
    ).toBe(false)
  })
})

describe('updateTenantSchema', () => {
  it('ignora slug e chaves desconhecidas', () => {
    expect(updateTenantSchema.parse({ name: 'X', slug: 'outro', ownerId: 'u' })).toEqual({
      name: 'X',
    })
  })

  it('corpo sem campo válido é EMPTY_UPDATE', () => {
    const result = updateTenantSchema.safeParse({ slug: 'outro' })
    expect(result.success).toBe(false)
    const [issue] = result.error!.issues
    expect(issue.code === 'custom' && issue.params).toEqual({ code: 'EMPTY_UPDATE' })
  })

  it('isReactivation só com isActive: true', () => {
    expect(isReactivation({ isActive: true })).toBe(true)
    expect(isReactivation({ isActive: true, name: 'X' })).toBe(false)
    expect(isReactivation({ isActive: false })).toBe(false)
  })
})
