import { MailTemplate } from '../mail-template'
import { PasswordResetRequestedPayload } from '../../../events/user.events'

// Conteúdo em português: é texto para o usuário final, não identificador.
export function passwordResetTemplate({
  name,
  resetUrl,
  expiresInMinutes,
}: PasswordResetRequestedPayload): MailTemplate {
  return {
    subject: 'Redefinição de senha',
    html: `
      <p>Olá, ${name}.</p>
      <p>Recebemos um pedido para redefinir a senha da sua conta no schdlr. Para escolher uma nova senha, acesse:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>O link vale por ${expiresInMinutes} minutos e só pode ser usado uma vez.</p>
      <p>Se não foi você quem pediu, ignore este e-mail: sua senha continua a mesma.</p>
    `.trim(),
  }
}
