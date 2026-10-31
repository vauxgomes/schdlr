import {
  changeTermStatusSchema,
  createTermSchema,
  listTermsQuerySchema,
  updateTermSchema,
} from './term.schemas'

const itemsOf = (result: { success: boolean; error?: { issues: unknown[] } }) =>
  (result.error!.issues as { path: string[]; code: string; params?: { code?: string } }[]).map(
    ({ path, code, params }) => `${path.join('.')}:${params?.code ?? code}`,
  )

describe('createTermSchema', () => {
  it('aceita datas YYYY-MM-DD e ignora status', () => {
    expect(
      createTermSchema.parse({
        name: ' 2026.1 ',
        startDate: '2026-02-02',
        endDate: '2026-07-04',
        status: 'STARTED',
      }),
    ).toEqual({ name: '2026.1', startDate: '2026-02-02', endDate: '2026-07-04' })
  })

  it('mesma data de início e fim passa', () => {
    expect(
      createTermSchema.safeParse({ name: 'X', startDate: '2026-02-02', endDate: '2026-02-02' })
        .success,
    ).toBe(true)
  })

  it('fim antes do início é END_BEFORE_START em endDate', () => {
    const result = createTermSchema.safeParse({
      name: 'X',
      startDate: '2026-08-01',
      endDate: '2026-07-01',
    })
    expect(result.success).toBe(false)
    expect(itemsOf(result)).toEqual(['endDate:END_BEFORE_START'])
  })

  it.each(['2026-2-2', '2026-02-30', '02/02/2026', '2026-02-02T00:00:00Z'])(
    'recusa a data %s',
    (startDate) => {
      expect(
        createTermSchema.safeParse({ name: 'X', startDate, endDate: '2026-12-01' }).success,
      ).toBe(false)
    },
  )
})

describe('updateTermSchema', () => {
  it('ignora status; sem campo válido é EMPTY_UPDATE', () => {
    expect(updateTermSchema.parse({ name: 'X', status: 'FINISHED' })).toEqual({ name: 'X' })
    expect(itemsOf(updateTermSchema.safeParse({ status: 'FINISHED' }))).toEqual([':EMPTY_UPDATE'])
  })

  it('com as duas datas, confere a ordem; com uma só, fica para o service', () => {
    expect(
      itemsOf(updateTermSchema.safeParse({ startDate: '2026-08-01', endDate: '2026-07-01' })),
    ).toEqual(['endDate:END_BEFORE_START'])
    expect(updateTermSchema.safeParse({ endDate: '2026-01-01' }).success).toBe(true)
  })
})

describe('status', () => {
  it('changeTermStatusSchema e listTermsQuerySchema aceitam só o enum', () => {
    expect(changeTermStatusSchema.parse({ status: 'STARTED' })).toEqual({ status: 'STARTED' })
    expect(changeTermStatusSchema.safeParse({ status: 'OPEN' }).success).toBe(false)
    expect(changeTermStatusSchema.safeParse({}).success).toBe(false)
    expect(listTermsQuerySchema.parse({})).toEqual({})
    expect(listTermsQuerySchema.safeParse({ status: 'OPEN' }).success).toBe(false)
  })
})
