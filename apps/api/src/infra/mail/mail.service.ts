import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createTransport, Transporter } from 'nodemailer'
import { Env } from '../../config/env'
import { MailTemplate } from './mail-template'

export type MailMessage = MailTemplate & {
  to: string
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name)
  private transporter: Transporter | null = null

  constructor(private readonly config: ConfigService<Env, true>) {}

  // Sem SMTP_HOST a app sobe assim mesmo, sem transporte: é o modo de
  // desenvolvimento, em que o envio vira uma linha de log.
  onModuleInit() {
    const host = this.config.get('SMTP_HOST', { infer: true })

    if (!host) {
      this.logger.warn('SMTP_HOST is not set — mail will be logged instead of sent')
      return
    }

    const user = this.config.get('SMTP_USER', { infer: true })
    const password = this.config.get('SMTP_PASSWORD', { infer: true })

    this.transporter = createTransport({
      host,
      port: this.config.get('SMTP_PORT', { infer: true }),
      secure: this.config.get('SMTP_SECURE', { infer: true }),
      auth: user && password ? { user, pass: password } : undefined,
    })
  }

  async send(message: MailMessage) {
    if (!this.transporter) {
      this.logger.log(
        `Mail not sent, no transport configured: "${message.subject}" to ${message.to}`,
      )
      return
    }

    await this.transporter.sendMail({
      from: this.config.get('MAIL_FROM', { infer: true }),
      to: message.to,
      subject: message.subject,
      html: message.html,
    })
  }
}
