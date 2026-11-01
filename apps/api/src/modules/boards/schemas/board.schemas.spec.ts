import { createBoardSchema, updateBoardSchema } from './board.schemas'

describe('createBoardSchema', () => {
  it('apara o nome; name e timeTableId são obrigatórios', () => {
    expect(createBoardSchema.parse({ name: ' INFO 2A ', timeTableId: 'tt' })).toEqual({
      name: 'INFO 2A',
      timeTableId: 'tt',
    })
    expect(createBoardSchema.safeParse({ name: 'INFO 2A' }).success).toBe(false)
    expect(createBoardSchema.safeParse({ timeTableId: 'tt' }).success).toBe(false)
  })
})

describe('updateBoardSchema', () => {
  it('aceita só nome ou só bloco; ignora as outras chaves', () => {
    expect(updateBoardSchema.parse({ name: 'INFO 2B', projectId: 'p' })).toEqual({
      name: 'INFO 2B',
    })
    expect(updateBoardSchema.parse({ timeTableId: 'tt' })).toEqual({ timeTableId: 'tt' })
  })

  it('sem campo válido é EMPTY_UPDATE', () => {
    const result = updateBoardSchema.safeParse({ projectId: 'p' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({ params: { code: 'EMPTY_UPDATE' } })
  })
})
