import {
  createOrganizationSchema,
  isOrganizationReactivation,
  updateOrganizationSchema,
} from './organization.schemas'

describe('createOrganizationSchema', () => {
  it('normaliza o slug e transforma endereço vazio em null', () => {
    expect(
      createOrganizationSchema.parse({ name: ' Acme ', slug: ' ACME-1 ', address: '  ' }),
    ).toEqual({
      name: 'Acme',
      slug: 'acme-1',
      address: null,
    })
  })

  it.each(['a', 'x'.repeat(61), '-acme', 'acme-', 'ac--me', 'ac me', 'açme'])(
    'recusa o slug %j',
    (slug) => {
      expect(createOrganizationSchema.safeParse({ name: 'A', slug }).success).toBe(false)
    },
  )

  it('recusa endereço acima de 300 caracteres', () => {
    expect(
      createOrganizationSchema.safeParse({ name: 'A', slug: 'ab', address: 'x'.repeat(301) })
        .success,
    ).toBe(false)
  })
})

describe('updateOrganizationSchema', () => {
  it('ignora slug e chaves desconhecidas', () => {
    expect(updateOrganizationSchema.parse({ name: 'X', slug: 'outro', ownerId: 'u' })).toEqual({
      name: 'X',
    })
  })

  it('corpo sem campo válido é EMPTY_UPDATE', () => {
    const result = updateOrganizationSchema.safeParse({ slug: 'outro' })
    expect(result.success).toBe(false)
    const [issue] = result.error!.issues
    expect(issue.code === 'custom' && issue.params).toEqual({ code: 'EMPTY_UPDATE' })
  })

  it('isOrganizationReactivation só com isActive: true', () => {
    expect(isOrganizationReactivation({ isActive: true })).toBe(true)
    expect(isOrganizationReactivation({ isActive: true, name: 'X' })).toBe(false)
    expect(isOrganizationReactivation({ isActive: false })).toBe(false)
  })
})
