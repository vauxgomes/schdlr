import { hhmmSchema } from './schemas/time-slot.schemas'
import { overlaps, toHHMM, toMinutes } from './time'

describe('hora na API', () => {
  it.each([
    ['00:00', 0],
    ['07:50', 470],
    ['12:05', 725],
    ['23:59', 1439],
  ])('%s ↔ %i', (hhmm, minutes) => {
    expect(toMinutes(hhmm)).toBe(minutes)
    expect(toHHMM(minutes)).toBe(hhmm)
  })

  it.each(['00:00', '09:30', '19:45', '23:59'])('hhmmSchema aceita %s', (value) => {
    expect(hhmmSchema.safeParse(value).success).toBe(true)
  })

  it.each(['24:00', '7:50', '07:5', '07:60', '25:00', '0750', '07:50:00', ''])(
    'hhmmSchema recusa %j',
    (value) => {
      expect(hhmmSchema.safeParse(value).success).toBe(false)
    },
  )
})

describe('overlaps', () => {
  const at = (start: string, end: string) => ({
    startTime: toMinutes(start),
    endTime: toMinutes(end),
  })

  it('intervalos que encostam não se sobrepõem', () => {
    expect(overlaps(at('07:00', '07:50'), at('07:50', '08:40'))).toBe(false)
    expect(overlaps(at('07:50', '08:40'), at('07:00', '07:50'))).toBe(false)
  })

  it.each([
    ['parcial', at('07:00', '08:00'), at('07:30', '08:30')],
    ['contido', at('07:00', '09:00'), at('07:30', '08:00')],
    ['igual', at('07:00', '07:50'), at('07:00', '07:50')],
    ['mesmo início', at('07:00', '07:50'), at('07:00', '08:40')],
  ])('%s se sobrepõe, nos dois sentidos', (_label, a, b) => {
    expect(overlaps(a, b)).toBe(true)
    expect(overlaps(b, a)).toBe(true)
  })

  it('separados não se sobrepõem', () => {
    expect(overlaps(at('07:00', '07:50'), at('08:00', '08:50'))).toBe(false)
  })
})
