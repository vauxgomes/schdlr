import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { OnEvent } from '@nestjs/event-emitter'
import { MailTemplate } from './mail-template'
import { UnitInviteEvent } from '../../events/unit-invite.events'
import type { UnitInviteCreatedPayload } from '../../events/unit-invite.events'
import { UserEvent } from '../../events/user.events'
import { Env } from '../../config/env'
import type { PasswordResetRequestedPayload, UserRegisteredPayload } from '../../events/user.events'
import { MailService } from './mail.service'
import { passwordResetTemplate } from './templates/password-reset.template'
import { unitInviteTemplate } from './templates/unit-invite.template'
import { welcomeTemplate } from './templates/welcome.template'

@Injectable()
export class MailListener {
  private readonly logger = new Logger(MailListener.name)

  constructor(
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @OnEvent(UserEvent.Registered)
  handleUserRegistered(payload: UserRegisteredPayload) {
    return this.deliver(payload.email, welcomeTemplate(payload))
  }

  @OnEvent(UserEvent.PasswordResetRequested)
  handlePasswordResetRequested(payload: PasswordResetRequestedPayload) {
    return this.deliver(payload.email, passwordResetTemplate(payload))
  }

  // Só o convidado sem conta recebe e-mail; quem já tem conta é avisado por
  // notificação, e mandar os dois seria ruído.
  @OnEvent(UnitInviteEvent.Created)
  handleUnitInviteCreated(payload: UnitInviteCreatedPayload) {
    if (payload.userId) return

    const webAppUrl = this.config.get('WEB_APP_URL', { infer: true })
    const inviteUrl = `${webAppUrl}/invites/${payload.token}`

    return this.deliver(payload.email, unitInviteTemplate(payload, inviteUrl))
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
