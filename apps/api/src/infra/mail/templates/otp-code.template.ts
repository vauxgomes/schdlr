import { OtpPurpose } from '@prisma/client'

import { MailContent } from '../mail.types'

export type OtpCodeTemplateInput = {
  code: string
  purpose: OtpPurpose
  expiresInMinutes: number
}

const SUBJECTS: Record<OtpPurpose, string> = {
  SIGN_IN: 'Seu código de acesso ao schdlr',
  SIGN_UP: 'Confirme seu cadastro no schdlr',
}

const INTROS: Record<OtpPurpose, string> = {
  SIGN_IN: 'Use o código abaixo para entrar no schdlr.',
  SIGN_UP: 'Use o código abaixo para confirmar seu cadastro no schdlr.',
}

export function otpCodeTemplate({
  code,
  purpose,
  expiresInMinutes,
}: OtpCodeTemplateInput): MailContent {
  const validity = `O código vale por ${expiresInMinutes} minutos.`
  const ignore = 'Se não foi você, ignore este e-mail.'

  return {
    subject: SUBJECTS[purpose],
    text: [INTROS[purpose], '', code, '', validity, ignore].join('\n'),
    html: `<table role="presentation" cellpadding="0" cellspacing="0" style="font-family: Arial, sans-serif; color: #222; max-width: 480px;">
  <tr><td style="padding: 16px 0;">${INTROS[purpose]}</td></tr>
  <tr><td style="padding: 16px; font-size: 32px; font-weight: bold; letter-spacing: 8px; background: #f2f2f2; text-align: center;">${code}</td></tr>
  <tr><td style="padding: 16px 0 4px;">${validity}</td></tr>
  <tr><td style="padding: 4px 0; color: #666; font-size: 13px;">${ignore}</td></tr>
</table>`,
  }
}
