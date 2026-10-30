import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { OtpPurpose } from '@prisma/client'

import { Env } from '@config/env.schema'

import { MAIL_TRANSPORT, type MailTransport } from './mail.transport'
import { MailMessage } from './mail.types'
import { otpCodeTemplate } from './templates/otp-code.template'

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name)
  private readonly from: string

  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport | null,
    config: ConfigService<Env, true>,
  ) {
    this.from = config.get('MAIL_FROM', { infer: true })
  }

  // Sem await: Gmail fora do ar não pode segurar nem derrubar a partida.
  onModuleInit() {
    this.transport?.verify().catch((error: unknown) => {
      this.logger.warn(`Servidor de e-mail indisponível: ${errorMessage(error)}`)
    })
  }

  /** O corpo nunca vai para o log: ele carrega códigos e tokens. */
  async send({ to, subject, text, html }: MailMessage): Promise<void> {
    const summary = `para=${to} assunto="${subject}"`

    if (!this.transport) {
      this.logger.log(`[mail desligado] ${summary}`)
      return
    }

    try {
      await this.transport.sendMail({ from: this.from, to, subject, text, html })
    } catch (error) {
      this.logger.error(`[mail falhou] ${summary} erro="${errorMessage(error)}"`)
      throw error
    }
    this.logger.log(`[mail enviado] ${summary}`)
  }

  sendOtpCode(input: {
    to: string
    code: string
    purpose: OtpPurpose
    expiresInMinutes: number
  }): Promise<void> {
    const { to, ...template } = input
    return this.send({ to, ...otpCodeTemplate(template) })
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
