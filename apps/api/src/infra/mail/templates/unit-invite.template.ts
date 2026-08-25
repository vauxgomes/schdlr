import { UnitInviteCreatedPayload } from '../../../events/unit-invite.events'
import { MailTemplate } from '../mail-template'

// Conteúdo em português: é texto para o usuário final, não identificador.
export function unitInviteTemplate(
  payload: UnitInviteCreatedPayload,
  inviteUrl: string,
): MailTemplate {
  return {
    subject: `Convite para ${payload.unitName} no schdlr`,
    html: `
      <p>Você foi convidado para participar de <strong>${payload.unitName}</strong> no schdlr.</p>
      <p>Como você ainda não tem conta, crie a sua por este link e o convite será aplicado:</p>
      <p><a href="${inviteUrl}">${inviteUrl}</a></p>
      <p>O convite vale até ${payload.expiresAt.toLocaleDateString('pt-BR')}.</p>
      <p>Se não esperava este convite, ignore este e-mail.</p>
    `.trim(),
  }
}
