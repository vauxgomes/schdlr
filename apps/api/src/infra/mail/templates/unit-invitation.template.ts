import { MailContent } from '../mail.types'

export type UnitInvitationTemplateInput = {
  inviterName: string
  unitName: string
  organizationName: string
  isManager: boolean
  isTeacher: boolean
  acceptUrl: string
  rejectUrl: string
  expiresAt: Date
}

// Nomes vêm de quem usa o sistema: não entram crus no HTML.
const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

/** "responsável e professor", "professor" ou, sem flag, "membro". */
export function roleLabel({ isManager, isTeacher }: { isManager: boolean; isTeacher: boolean }) {
  const roles = [isManager && 'responsável', isTeacher && 'professor'].filter(Boolean)
  return roles.length > 0 ? roles.join(' e ') : 'membro'
}

const formatDate = (date: Date) =>
  date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

const button = (href: string, label: string, background: string) =>
  `<a href="${escapeHtml(href)}" style="display: inline-block; padding: 12px 24px; margin-right: 8px; background: ${background}; color: #fff; text-decoration: none; border-radius: 4px;">${label}</a>`

export function unitInvitationTemplate(input: UnitInvitationTemplateInput): MailContent {
  const { inviterName, unitName, organizationName, acceptUrl, rejectUrl, expiresAt } = input
  const role = roleLabel(input)
  const intro = (name: string, unit: string, org: string) =>
    `${name} convidou você para a unidade ${unit}, da organização ${org}, no schdlr, como ${role}.`
  const validity = `O convite vale até ${formatDate(expiresAt)}.`
  const ignore = 'Se não esperava este convite, ignore este e-mail.'

  return {
    subject: `Convite para a unidade ${unitName} no schdlr`,
    text: [
      intro(inviterName, unitName, organizationName),
      '',
      `Aceitar: ${acceptUrl}`,
      `Recusar: ${rejectUrl}`,
      '',
      validity,
      ignore,
    ].join('\n'),
    html: `<table role="presentation" cellpadding="0" cellspacing="0" style="font-family: Arial, sans-serif; color: #222; max-width: 480px;">
  <tr><td style="padding: 16px 0;">${intro(escapeHtml(inviterName), `<strong>${escapeHtml(unitName)}</strong>`, escapeHtml(organizationName))}</td></tr>
  <tr><td style="padding: 16px 0;">${button(acceptUrl, 'Aceitar', '#1a7f37')}${button(rejectUrl, 'Recusar', '#666')}</td></tr>
  <tr><td style="padding: 16px 0 4px;">${validity}</td></tr>
  <tr><td style="padding: 4px 0; color: #666; font-size: 13px;">${ignore}</td></tr>
</table>`,
  }
}
