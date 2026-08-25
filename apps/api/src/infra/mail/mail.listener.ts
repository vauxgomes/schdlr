import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { MailTemplate } from './mail-template'
import { UserEvent } from '../../events/user.events'
import type { PasswordResetRequestedPayload, UserRegisteredPayload } from '../../events/user.events'
import { MailService } from './mail.service'
import { passwordResetTemplate } from './templates/password-reset.template'
import { welcomeTemplate } from './templates/welcome.template'

@Injectable()
export class MailListener {
  private readonly logger = new Logger(MailListener.name)

  constructor(private readonly mail: MailService) {}

  @OnEvent(UserEvent.Registered)
  handleUserRegistered(payload: UserRegisteredPayload) {
    return this.deliver(payload.email, welcomeTemplate(payload))
  }

  @OnEvent(UserEvent.PasswordResetRequested)
  handlePasswordResetRequested(payload: PasswordResetRequestedPayload) {
    return this.deliver(payload.email, passwordResetTemplate(payload))
  }

  // Fronteira entre domínio e entrega: falha de SMTP vira log, nunca exceção
  // subindo de volta para quem emitiu o evento — o cadastro já deu certo.
  private async deliver(to: string, template: MailTemplate) {
    try {
      await this.mail.send({ to, ...template })
    } catch (error) {
      this.logger.error(`Failed to deliver "${template.subject}" to ${to}`, error)
    }
  }
}
