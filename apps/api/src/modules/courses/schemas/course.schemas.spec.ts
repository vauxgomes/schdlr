import {
  codeSchema,
  createCourseSchema,
  isCourseReactivation,
  updateCourseSchema,
} from './course.schemas'

describe('codeSchema', () => {
  it.each(['INFO', 'ADS', 'MAT-101', '2024.1', 'A_B'])('aceita %s', (code) => {
    expect(codeSchema.parse(code)).toBe(code)
  })

  it('normaliza para maiúsculas, sem espaços', () => {
    expect(codeSchema.parse(' info ')).toBe('INFO')
  })

  it.each(['', 'A B', '-A', 'A-', 'A--B', 'Á', 'X'.repeat(21)])('recusa %j', (code) => {
    expect(codeSchema.safeParse(code).success).toBe(false)
  })
})

describe('createCourseSchema', () => {
  it('código e coordenador ausentes viram null', () => {
    expect(createCourseSchema.parse({ name: ' Informática ' })).toEqual({
      name: 'Informática',
      code: null,
      coordinatorId: null,
    })
  })

  it('código vazio vira null; preenchido é normalizado', () => {
    expect(createCourseSchema.parse({ name: 'X', code: '  ' }).code).toBeNull()
    expect(createCourseSchema.parse({ name: 'X', code: ' mat-101 ' }).code).toBe('MAT-101')
  })

  it('recusa código fora do formato', () => {
    expect(createCourseSchema.safeParse({ name: 'X', code: 'não' }).success).toBe(false)
  })
})

describe('updateCourseSchema', () => {
  it('code: null remove; coordinatorId: null tira; chaves extras somem', () => {
    expect(updateCourseSchema.parse({ code: null, coordinatorId: null, unitId: 'u' })).toEqual({
      code: null,
      coordinatorId: null,
    })
  })

  it('corpo sem campo válido é EMPTY_UPDATE', () => {
    const result = updateCourseSchema.safeParse({ unitId: 'u' })
    expect(result.success).toBe(false)
    const [issue] = result.error!.issues
    expect(issue.code === 'custom' && issue.params).toEqual({ code: 'EMPTY_UPDATE' })
  })

  it('isCourseReactivation só com isActive: true', () => {
    expect(isCourseReactivation({ isActive: true })).toBe(true)
    expect(isCourseReactivation({ isActive: true, code: null })).toBe(false)
    expect(isCourseReactivation({ isActive: false })).toBe(false)
  })
})
