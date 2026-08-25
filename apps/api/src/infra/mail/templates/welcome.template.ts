import { MailTemplate } from '../mail-template'
import { UserRegisteredPayload } from '../../../events/user.events'

// Conteúdo em português: é texto para o usuário final, não identificador.
export function welcomeTemplate({ name }: UserRegisteredPayload): MailTemplate {
  return {
    subject: 'Bem-vindo ao schdlr',
    html: `
      <p>Olá, ${name}.</p>
      <p>Sua conta no schdlr está pronta. A partir de agora você pode criar sua organização e montar as grades de horário.</p>
      <p>Se não foi você quem criou esta conta, ignore este e-mail.</p>
    `.trim(),
  }
}
