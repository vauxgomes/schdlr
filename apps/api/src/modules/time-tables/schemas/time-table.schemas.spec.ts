import {
  createTimeTableSchema,
  isTimeTableReactivation,
  MAX_SLOTS,
  updateTimeTableSchema,
} from './time-table.schemas'

const itemsOf = (result: { success: boolean; error?: { issues: unknown[] } }) =>
  (result.error!.issues as { path: string[]; code: string; params?: { code?: string } }[]).map(
    ({ path, code, params }) => `${path.join('.')}:${params?.code ?? code}`,
  )
const slot = (name: string, startTime: string, endTime: string) => ({ name, startTime, endTime })

describe('createTimeTableSchema', () => {
  it('slots ausente vira lista vazia', () => {
    expect(createTimeTableSchema.parse({ name: ' Manhã ' })).toEqual({ name: 'Manhã', slots: [] })
  })

  it('horários que encostam passam', () => {
    expect(
      createTimeTableSchema.safeParse({
        name: 'Manhã',
        slots: [slot('M1', '07:00', '07:50'), slot('M2', '07:50', '08:40')],
      }).success,
    ).toBe(true)
  })

  it('sobreposição na lista é SLOTS_OVERLAP no segundo da dupla', () => {
    expect(
      itemsOf(
        createTimeTableSchema.safeParse({
          name: 'X',
          slots: [
            slot('A', '07:00', '08:00'),
            slot('C', '09:00', '10:00'),
            slot('B', '07:30', '08:30'),
          ],
        }),
      ),
    ).toEqual(['slots.2:SLOTS_OVERLAP'])
  })

  it('cada horário segue as regras de horário', () => {
    expect(
      itemsOf(createTimeTableSchema.safeParse({ name: 'X', slots: [slot('A', '08:00', '07:00')] })),
    ).toEqual(['slots.0.endTime:END_NOT_AFTER_START'])
  })

  it(`no máximo ${MAX_SLOTS} horários`, () => {
    const slots = Array.from({ length: MAX_SLOTS + 1 }, (_, i) =>
      slot(
        `H${i}`,
        `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
        '23:59',
      ),
    )
    expect(itemsOf(createTimeTableSchema.safeParse({ name: 'X', slots }))).toContain(
      'slots:too_big',
    )
  })
})

describe('updateTimeTableSchema', () => {
  it('só nome e isActive; sem campo válido é EMPTY_UPDATE', () => {
    expect(updateTimeTableSchema.parse({ name: 'Tarde', slots: [] })).toEqual({ name: 'Tarde' })
    expect(itemsOf(updateTimeTableSchema.safeParse({ slots: [] }))).toEqual([':EMPTY_UPDATE'])
  })

  it('isTimeTableReactivation só com isActive: true', () => {
    expect(isTimeTableReactivation({ isActive: true })).toBe(true)
    expect(isTimeTableReactivation({ isActive: true, name: 'X' })).toBe(false)
    expect(isTimeTableReactivation({ isActive: false })).toBe(false)
  })
})
