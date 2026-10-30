import { roleLabel, unitInvitationTemplate } from './unit-invitation.template'

const input = {
  inviterName: 'Admin Teste',
  unitName: 'Unidade Teste',
  organizationName: 'Root-Test-Organization',
  isManager: false,
  isTeacher: true,
  acceptUrl: 'http://localhost:3000/invitations/tok?action=accept',
  rejectUrl: 'http://localhost:3000/invitations/tok?action=reject',
  expiresAt: new Date('2026-11-06T15:00:00.000Z'),
}

describe('unitInvitationTemplate', () => {
  it('assunto com o nome da unidade', () => {
    expect(unitInvitationTemplate(input).subject).toBe(
      'Convite para a unidade Unidade Teste no schdlr',
    )
  })

  it('traz quem convidou, unidade, organização, papel, validade e os dois links', () => {
    const mail = unitInvitationTemplate(input)
    for (const body of [mail.text, mail.html!]) {
      expect(body).toContain('Admin Teste')
      expect(body).toContain('Unidade Teste')
      expect(body).toContain('Root-Test-Organization')
      expect(body).toContain('como professor')
      expect(body).toContain('O convite vale até 06/11/2026.')
      expect(body).toContain(input.acceptUrl)
      expect(body).toContain(input.rejectUrl)
      expect(body).toContain('Se não esperava este convite, ignore este e-mail.')
    }
  })

  it.each([
    [true, true, 'responsável e professor'],
    [true, false, 'responsável'],
    [false, true, 'professor'],
    [false, false, 'membro'],
  ])('isManager %s, isTeacher %s → %s', (isManager, isTeacher, label) => {
    expect(roleLabel({ isManager, isTeacher })).toBe(label)
  })

  it('escapa os nomes no HTML', () => {
    const mail = unitInvitationTemplate({ ...input, inviterName: '<b>Eve</b>' })
    expect(mail.html).toContain('&lt;b&gt;Eve&lt;/b&gt;')
    expect(mail.html).not.toContain('<b>Eve</b>')
  })
})
