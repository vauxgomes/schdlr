import { createSubjectSchema, isSubjectReactivation, updateSubjectSchema } from './subject.schemas'

const codesOf = (body: unknown) => {
  const result = createSubjectSchema.safeParse(body)
  expect(result.success).toBe(false)
  return result.error!.issues.map(({ path, code }) => `${path.join('.')}:${code}`)
}

describe('createSubjectSchema', () => {
  it('normaliza código e cor; level e color ausentes ficam 1 e #000000', () => {
    expect(
      createSubjectSchema.parse({ name: ' Matemática I ', code: 'mat-101', workload: 80 }),
    ).toEqual({ name: 'Matemática I', code: 'MAT-101', workload: 80, level: 1, color: '#000000' })
    expect(
      createSubjectSchema.parse({ name: 'X', code: 'X', workload: 1, color: '#1e88e5' }).color,
    ).toBe('#1E88E5')
  })

  it('workload, level e color fora da regra saem com os códigos do Zod', () => {
    expect(codesOf({ name: 'X', code: 'X', workload: 0, color: 'azul' })).toEqual([
      'workload:too_small',
      'color:invalid_format',
    ])
    expect(codesOf({ name: 'X', code: 'X', workload: 1001, level: 10000 })).toEqual([
      'workload:too_big',
      'level:too_big',
    ])
    expect(codesOf({ name: 'X', code: 'X', workload: '80', level: 0 })).toEqual([
      'workload:invalid_type',
      'level:too_small',
    ])
  })

  it.each([1.5, -1])('workload %p é inválido', (workload) => {
    expect(createSubjectSchema.safeParse({ name: 'X', code: 'X', workload }).success).toBe(false)
  })

  it('código é obrigatório', () => {
    expect(codesOf({ name: 'X', workload: 10 })).toEqual(['code:invalid_type'])
  })
})

describe('updateSubjectSchema', () => {
  it('chaves extras somem; sem campo válido é EMPTY_UPDATE', () => {
    expect(updateSubjectSchema.parse({ workload: 70, curriculumId: 'c' })).toEqual({ workload: 70 })
    const result = updateSubjectSchema.safeParse({ curriculumId: 'c' })
    expect(result.success).toBe(false)
    const [issue] = result.error!.issues
    expect(issue.code === 'custom' && issue.params).toEqual({ code: 'EMPTY_UPDATE' })
  })

  it('isSubjectReactivation só com isActive: true', () => {
    expect(isSubjectReactivation({ isActive: true })).toBe(true)
    expect(isSubjectReactivation({ isActive: true, level: 2 })).toBe(false)
    expect(isSubjectReactivation({ isActive: false })).toBe(false)
  })
})
