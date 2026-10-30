import { FactoryProvider } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createTransport, Transporter } from 'nodemailer'

import { Env } from '@config/env.schema'

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT')

export type MailTransport = Pick<Transporter, 'sendMail' | 'verify'>

/** Com MAIL_ENABLED=false nenhum transporte é criado: o MailService só registra no log. */
export const mailTransportProvider: FactoryProvider<MailTransport | null> = {
  provide: MAIL_TRANSPORT,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) =>
    config.get('MAIL_ENABLED', { infer: true })
      ? createTransport({
          service: 'gmail',
          auth: {
            user: config.get('MAIL_USER', { infer: true }),
            pass: config.get('MAIL_PASS', { infer: true }),
          },
        })
      : null,
}
