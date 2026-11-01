import {
  changeProjectStatusSchema,
  createProjectSchema,
  listProjectsQuerySchema,
  updateProjectSchema,
} from './project.schemas'

describe('createProjectSchema', () => {
  it('workingDays ausente vira 5; status é ignorado', () => {
    expect(
      createProjectSchema.parse({
        name: ' INFO 2026.1 ',
        termId: 't',
        curriculumId: 'c',
        status: 'DRAFT',
      }),
    ).toEqual({ name: 'INFO 2026.1', termId: 't', curriculumId: 'c', workingDays: 5 })
  })

  it.each([4, 7, '5', 5.5])('workingDays %p é inválido', (workingDays) => {
    expect(
      createProjectSchema.safeParse({ name: 'X', termId: 't', curriculumId: 'c', workingDays })
        .success,
    ).toBe(false)
  })

  it('termId e curriculumId são obrigatórios', () => {
    expect(createProjectSchema.safeParse({ name: 'X' }).success).toBe(false)
  })
})

describe('updateProjectSchema', () => {
  it('ignora termId, curriculumId e status; sem campo válido é EMPTY_UPDATE', () => {
    expect(
      updateProjectSchema.parse({
        workingDays: 6,
        termId: 't',
        curriculumId: 'c',
        status: 'DRAFT',
      }),
    ).toEqual({ workingDays: 6 })
    const result = updateProjectSchema.safeParse({ status: 'DRAFT' })
    expect(result.success).toBe(false)
    const [issue] = result.error!.issues
    expect(issue.code === 'custom' && issue.params).toEqual({ code: 'EMPTY_UPDATE' })
  })
})

describe('status', () => {
  it('só DRAFT e PUBLISHED', () => {
    expect(changeProjectStatusSchema.parse({ status: 'PUBLISHED' })).toEqual({
      status: 'PUBLISHED',
    })
    expect(changeProjectStatusSchema.safeParse({ status: 'ARCHIVED' }).success).toBe(false)
    expect(listProjectsQuerySchema.parse({ termId: 't', status: 'DRAFT' })).toEqual({
      termId: 't',
      status: 'DRAFT',
    })
    expect(listProjectsQuerySchema.safeParse({ status: 'ARCHIVED' }).success).toBe(false)
  })
})
