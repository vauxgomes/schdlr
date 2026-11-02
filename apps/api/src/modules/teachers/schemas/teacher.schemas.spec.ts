import {
  createTeacherSchema,
  isTeacherReactivation,
  listTeachersQuerySchema,
  updateTeacherSchema,
} from './teacher.schemas'

describe('createTeacherSchema', () => {
  it('apara os textos; area e notes ausentes ou vazios viram null; userId é opcional', () => {
    expect(createTeacherSchema.parse({ name: ' Professor de Matemática 1 ', area: ' ' })).toEqual({
      name: 'Professor de Matemática 1',
      area: null,
      notes: null,
    })
    expect(
      createTeacherSchema.parse({ name: 'Ana', area: 'Redes', notes: 'Edital 12', userId: 'u-1' }),
    ).toEqual({ name: 'Ana', area: 'Redes', notes: 'Edital 12', userId: 'u-1' })
  })

  it('area acima de 120 e notes acima de 1000 caracteres são inválidas', () => {
    const result = createTeacherSchema.safeParse({
      name: 'X',
      area: 'a'.repeat(121),
      notes: 'n'.repeat(1001),
    })
    expect(result.success).toBe(false)
    expect(result.error!.issues.map(({ path, code }) => `${path.join('.')}:${code}`)).toEqual([
      'area:too_big',
      'notes:too_big',
    ])
  })
})

describe('updateTeacherSchema', () => {
  it('userId é descartado: o vínculo não muda', () => {
    expect(updateTeacherSchema.parse({ userId: 'u-1', notes: '' })).toEqual({ notes: null })
  })

  it('sem campo válido é EMPTY_UPDATE, inclusive só com userId', () => {
    const result = updateTeacherSchema.safeParse({ userId: 'u-1' })
    expect(result.success).toBe(false)
    const [issue] = result.error!.issues
    expect(issue.code === 'custom' && issue.params).toEqual({ code: 'EMPTY_UPDATE' })
  })

  it('isTeacherReactivation só com isActive: true', () => {
    expect(isTeacherReactivation({ isActive: true })).toBe(true)
    expect(isTeacherReactivation({ isActive: true, notes: null })).toBe(false)
    expect(isTeacherReactivation({ isActive: false })).toBe(false)
  })
})

describe('listTeachersQuerySchema', () => {
  it('active e linked leem "true" e "false"; fora de booleano é inválido', () => {
    expect(listTeachersQuerySchema.parse({ q: ' mat ', active: 'false', linked: 'true' })).toEqual({
      q: 'mat',
      active: false,
      linked: true,
    })
    expect(listTeachersQuerySchema.safeParse({ linked: 'talvez' }).success).toBe(false)
  })
})
