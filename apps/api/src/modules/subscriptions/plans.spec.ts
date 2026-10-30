import { addMonths, PLANS } from './plans'

describe('PLANS', () => {
  it('tem os limites e durações combinados', () => {
    expect(PLANS).toEqual({
      GRACE: {
        limits: { organizations: 1, unitsPerOrganization: 1, coursesPerUnit: 5 },
        durationMonths: null,
      },
      TRIAL: {
        limits: { organizations: 1, unitsPerOrganization: 1, coursesPerUnit: 3 },
        durationMonths: 1,
      },
      BASIC: {
        limits: { organizations: 1, unitsPerOrganization: 5, coursesPerUnit: 5 },
        durationMonths: 1,
      },
      PRO: {
        limits: { organizations: null, unitsPerOrganization: null, coursesPerUnit: null },
        durationMonths: 1,
      },
    })
  })
})

describe('addMonths', () => {
  const at = (iso: string) => addMonths(new Date(iso), 1).toISOString()

  it('mantém dia e hora', () => {
    expect(at('2026-10-30T10:15:00.000Z')).toBe('2026-11-30T10:15:00.000Z')
  })

  it('vai para o último dia quando o dia não existe', () => {
    expect(at('2027-01-31T08:00:00.000Z')).toBe('2027-02-28T08:00:00.000Z')
    expect(at('2028-01-31T08:00:00.000Z')).toBe('2028-02-29T08:00:00.000Z')
    expect(at('2026-03-31T08:00:00.000Z')).toBe('2026-04-30T08:00:00.000Z')
  })

  it('vira o ano', () => {
    expect(at('2026-12-15T00:00:00.000Z')).toBe('2027-01-15T00:00:00.000Z')
  })

  it('não altera a data de entrada', () => {
    const date = new Date('2026-10-30T00:00:00.000Z')
    addMonths(date, 1)
    expect(date.toISOString()).toBe('2026-10-30T00:00:00.000Z')
  })
})
