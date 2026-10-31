import { createTimeSlotSchema, updateTimeSlotSchema } from './time-slot.schemas'

const itemsOf = (result: { success: boolean; error?: { issues: unknown[] } }) =>
  (result.error!.issues as { path: string[]; code: string; params?: { code?: string } }[]).map(
    ({ path, code, params }) => `${path.join('.')}:${params?.code ?? code}`,
  )

describe('createTimeSlotSchema', () => {
  it('aceita e normaliza o nome', () => {
    expect(
      createTimeSlotSchema.parse({ name: ' M1 ', startTime: '07:00', endTime: '07:50' }),
    ).toEqual({ name: 'M1', startTime: '07:00', endTime: '07:50' })
  })

  it('nome é obrigatório, de 1 a 40', () => {
    expect(
      itemsOf(createTimeSlotSchema.safeParse({ startTime: '07:00', endTime: '07:50' })),
    ).toEqual(['name:invalid_type'])
    expect(
      createTimeSlotSchema.safeParse({ name: 'x'.repeat(41), startTime: '07:00', endTime: '07:50' })
        .success,
    ).toBe(false)
  })

  it.each([
    ['fim antes do início', '09:00', '08:00'],
    ['duração zero', '08:00', '08:00'],
  ])('%s é END_NOT_AFTER_START em endTime', (_label, startTime, endTime) => {
    expect(itemsOf(createTimeSlotSchema.safeParse({ name: 'A', startTime, endTime }))).toEqual([
      'endTime:END_NOT_AFTER_START',
    ])
  })

  it('24:00 é invalid_format', () => {
    expect(
      itemsOf(createTimeSlotSchema.safeParse({ name: 'N6', startTime: '23:10', endTime: '24:00' })),
    ).toEqual(['endTime:invalid_format'])
  })
})

describe('updateTimeSlotSchema', () => {
  it('sem campo válido é EMPTY_UPDATE; com uma hora só, fica para o service', () => {
    expect(itemsOf(updateTimeSlotSchema.safeParse({ timeTableId: 'x' }))).toEqual([':EMPTY_UPDATE'])
    expect(updateTimeSlotSchema.safeParse({ endTime: '06:00' }).success).toBe(true)
    expect(
      itemsOf(updateTimeSlotSchema.safeParse({ startTime: '09:00', endTime: '08:00' })),
    ).toEqual(['endTime:END_NOT_AFTER_START'])
  })
})
