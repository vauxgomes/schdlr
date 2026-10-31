import {
  createLocationSchema,
  isLocationReactivation,
  listLocationsQuerySchema,
  updateLocationSchema,
} from './location.schemas'

describe('createLocationSchema', () => {
  it('capacity ausente vira null', () => {
    expect(createLocationSchema.parse({ name: ' Meet A ', type: 'VIRTUAL' })).toEqual({
      name: 'Meet A',
      type: 'VIRTUAL',
      capacity: null,
    })
    expect(createLocationSchema.parse({ name: 'Sala', type: 'CLASSROOM', capacity: 40 })).toEqual({
      name: 'Sala',
      type: 'CLASSROOM',
      capacity: 40,
    })
  })

  it('type fora do enum e capacity fora de 1–10000 dão os códigos do Zod', () => {
    const result = createLocationSchema.safeParse({ name: 'X', type: 'GARAGE', capacity: 0 })
    expect(result.success).toBe(false)
    expect(result.error!.issues.map(({ path, code }) => `${path.join('.')}:${code}`)).toEqual([
      'type:invalid_value',
      'capacity:too_small',
    ])
  })

  it.each([10001, 1.5])('capacity %p é inválida', (capacity) => {
    expect(createLocationSchema.safeParse({ name: 'X', type: 'LAB', capacity }).success).toBe(false)
  })
})

describe('updateLocationSchema', () => {
  it('capacity: null limpa; chaves extras somem', () => {
    expect(updateLocationSchema.parse({ capacity: null, unitId: 'u' })).toEqual({ capacity: null })
  })

  it('corpo sem campo válido é EMPTY_UPDATE', () => {
    const result = updateLocationSchema.safeParse({ unitId: 'u' })
    expect(result.success).toBe(false)
    const [issue] = result.error!.issues
    expect(issue.code === 'custom' && issue.params).toEqual({ code: 'EMPTY_UPDATE' })
  })

  it('isLocationReactivation só com isActive: true', () => {
    expect(isLocationReactivation({ isActive: true })).toBe(true)
    expect(isLocationReactivation({ isActive: true, capacity: null })).toBe(false)
    expect(isLocationReactivation({ isActive: false })).toBe(false)
  })
})

describe('listLocationsQuerySchema', () => {
  it('type opcional, do enum', () => {
    expect(listLocationsQuerySchema.parse({})).toEqual({})
    expect(listLocationsQuerySchema.parse({ type: 'LAB' })).toEqual({ type: 'LAB' })
    expect(listLocationsQuerySchema.safeParse({ type: 'GARAGE' }).success).toBe(false)
  })
})
