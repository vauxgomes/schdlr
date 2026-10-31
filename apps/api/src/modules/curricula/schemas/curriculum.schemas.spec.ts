import {
  createCurriculumSchema,
  isCurriculumReactivation,
  updateCurriculumSchema,
} from './curriculum.schemas'

describe('createCurriculumSchema', () => {
  it('normaliza o código; descrição ausente ou vazia vira null', () => {
    expect(createCurriculumSchema.parse({ name: ' Matriz 2024 ', code: ' 2024.1 ' })).toEqual({
      name: 'Matriz 2024',
      code: '2024.1',
      description: null,
    })
    expect(
      createCurriculumSchema.parse({ name: 'X', code: 'a', description: '  ' }).description,
    ).toBeNull()
  })

  it.each([
    ['sem código', { name: 'X' }],
    ['código vazio', { name: 'X', code: '' }],
    ['código fora do formato', { name: 'X', code: 'a b' }],
    ['descrição longa', { name: 'X', code: 'A', description: 'x'.repeat(1001) }],
  ])('recusa %s', (_label, body) => {
    expect(createCurriculumSchema.safeParse(body).success).toBe(false)
  })
})

describe('updateCurriculumSchema', () => {
  it('description: null limpa; chaves extras somem', () => {
    expect(updateCurriculumSchema.parse({ description: null, courseId: 'c' })).toEqual({
      description: null,
    })
  })

  it('code: null é inválido (o código é obrigatório)', () => {
    expect(updateCurriculumSchema.safeParse({ code: null }).success).toBe(false)
  })

  it('corpo sem campo válido é EMPTY_UPDATE', () => {
    const result = updateCurriculumSchema.safeParse({ courseId: 'c' })
    expect(result.success).toBe(false)
    const [issue] = result.error!.issues
    expect(issue.code === 'custom' && issue.params).toEqual({ code: 'EMPTY_UPDATE' })
  })

  it('isCurriculumReactivation só com isActive: true', () => {
    expect(isCurriculumReactivation({ isActive: true })).toBe(true)
    expect(isCurriculumReactivation({ isActive: true, description: null })).toBe(false)
    expect(isCurriculumReactivation({ isActive: false })).toBe(false)
  })
})
