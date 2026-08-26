import { AuditEntry } from '../audit-entry'
import { formatAuditLine } from './format-audit-line'

// O regex publicado na spec 0022. Se este teste quebrar, todo consumidor da
// trilha quebrou junto — é para isso que ele está aqui.
const LINE =
  /^(?<ts>\S+) audit\/1 outcome=(?<outcome>ok|denied) actor=(?<actor>\S+) actor\.name="(?<name>[^"]*)" member=(?<member>\S+) unit=(?<unit>\S+) action=(?<action>[a-z-]+\.[a-z-]+) subject=(?<model>[a-z_]+):(?<id>\S+) req=(?<req>\S+) data=(?<data>.*)$/

const base: AuditEntry = {
  timestamp: new Date('2026-08-14T22:31:04.512Z'),
  outcome: 'ok',
  actorId: 'cme3k1x2q0001',
  actorName: 'Developer Example',
  memberId: 'cmr9v2',
  unitId: 'cmu7k1',
  action: 'member.roles-changed',
  subjectType: 'unit_member',
  subjectId: 'cmm4p8',
  requestId: '01J8ZQ4F',
  data: { roles: ['COORDINATOR'] },
}

describe('formatAuditLine', () => {
  it('produces the documented line', () => {
    expect(formatAuditLine(base)).toBe(
      '2026-08-14T22:31:04.512Z audit/1 outcome=ok actor=cme3k1x2q0001 actor.name="Developer Example" ' +
        'member=cmr9v2 unit=cmu7k1 action=member.roles-changed subject=unit_member:cmm4p8 ' +
        'req=01J8ZQ4F data={"roles":["COORDINATOR"]}',
    )
  })

  it('matches the published regex', () => {
    expect(LINE.test(formatAuditLine(base))).toBe(true)
  })

  it('keeps matching with null fields', () => {
    const line = formatAuditLine({ ...base, memberId: null, unitId: null })

    expect(line).toContain('member=- unit=-')
    expect(LINE.test(line)).toBe(true)
  })

  // O nome é o único campo com espaço, e aspas dentro dele arrebentariam o
  // casamento do campo seguinte.
  it('survives a name with accents, spaces and quotes', () => {
    const line = formatAuditLine({ ...base, actorName: 'José "Zé" da Conceição' })
    const match = LINE.exec(line)

    expect(match?.groups?.name).toBe("José 'Zé' da Conceição")
    expect(match?.groups?.action).toBe('member.roles-changed')
  })

  it('formats a denial with the route as subject', () => {
    const line = formatAuditLine({
      ...base,
      outcome: 'denied',
      action: 'access.denied',
      subjectType: 'route',
      subjectId: 'PATCH_/units/:unitId/members/:memberId/roles',
      memberId: null,
      data: { assert: 'assertManagement' },
    })

    expect(LINE.exec(line)?.groups?.outcome).toBe('denied')
  })
})
