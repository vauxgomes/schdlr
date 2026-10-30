import { otpCodeTemplate } from './otp-code.template'

describe('otpCodeTemplate', () => {
  it('usa o assunto de acesso no SIGN_IN', () => {
    const mail = otpCodeTemplate({ code: '482913', purpose: 'SIGN_IN', expiresInMinutes: 10 })
    expect(mail.subject).toBe('Seu código de acesso ao schdlr')
  })

  it('usa o assunto de cadastro no SIGN_UP', () => {
    const mail = otpCodeTemplate({ code: '482913', purpose: 'SIGN_UP', expiresInMinutes: 10 })
    expect(mail.subject).toBe('Confirme seu cadastro no schdlr')
  })

  it('traz código e validade no texto e no HTML', () => {
    const mail = otpCodeTemplate({ code: '007201', purpose: 'SIGN_IN', expiresInMinutes: 15 })
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain('007201')
      expect(body).toContain('O código vale por 15 minutos.')
      expect(body).toContain('Se não foi você, ignore este e-mail.')
    }
  })
})
