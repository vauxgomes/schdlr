import { listOfferingsQuerySchema, updateOfferingSchema } from './offering.schemas'

describe('updateOfferingSchema', () => {
  it('aceita teacherId e null; ignora as outras chaves', () => {
    expect(updateOfferingSchema.parse({ teacherId: 'u-1', subjectId: 's' })).toEqual({
      teacherId: 'u-1',
    })
    expect(updateOfferingSchema.parse({ teacherId: null })).toEqual({ teacherId: null })
  })

  it('sem teacherId é EMPTY_UPDATE', () => {
    const result = updateOfferingSchema.safeParse({ subjectId: 's' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({ params: { code: 'EMPTY_UPDATE' } })
  })

  it('teacherId que não é string nem null é inválido', () => {
    expect(updateOfferingSchema.safeParse({ teacherId: 1 }).success).toBe(false)
  })
})

describe('listOfferingsQuerySchema', () => {
  it('withoutTeacher lê "true" e "false" como booleanos', () => {
    expect(listOfferingsQuerySchema.parse({ withoutTeacher: 'true' })).toEqual({
      withoutTeacher: true,
    })
    expect(listOfferingsQuerySchema.parse({ withoutTeacher: 'false' })).toEqual({
      withoutTeacher: false,
    })
  })

  it('withoutTeacher fora de booleano é inválido; teacherId passa como veio', () => {
    expect(listOfferingsQuerySchema.safeParse({ withoutTeacher: 'talvez' }).success).toBe(false)
    expect(listOfferingsQuerySchema.parse({ teacherId: 'u-1' })).toEqual({ teacherId: 'u-1' })
  })
})
