import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { MailTemplate } from './mail-template'
import { MailEvent } from './mail.events'
import type { WelcomeMailPayload } from './mail.events'
import { MailService } from './mail.service'
import { welcomeTemplate } from './templates/welcome.template'

@Injectable()
export class MailListener {
  private readonly logger = new Logger(MailListener.name)

  constructor(private readonly mail: MailService) {}

  @OnEvent(MailEvent.Welcome)
  handleWelcome(payload: WelcomeMailPayload) {
    return this.deliver(payload.email, welcomeTemplate(payload))
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
