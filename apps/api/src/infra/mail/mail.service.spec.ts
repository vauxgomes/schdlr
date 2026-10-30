import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { Env } from '@config/env.schema'

import { MailService } from './mail.service'

const config = { get: () => 'noreply@schdlr.test' } as unknown as ConfigService<Env, true>
const message = {
  to: 'ana@ifce.edu.br',
  subject: 'Assunto',
  text: 'corpo-secreto',
  html: '<p>corpo-secreto</p>',
}

function logged(...spies: jest.SpyInstance[]) {
  return spies.flatMap((spy) => spy.mock.calls.map((call: unknown[]) => String(call[0]))).join('\n')
}

describe('MailService', () => {
  let log: jest.SpyInstance
  let warn: jest.SpyInstance
  let error: jest.SpyInstance

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation()
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation()
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation()
  })

  afterEach(() => jest.restoreAllMocks())

  describe('com MAIL_ENABLED=false', () => {
    const service = new MailService(null, config)

    it('não envia e registra destinatário e assunto', async () => {
      await service.send(message)
      expect(log).toHaveBeenCalledWith('[mail desligado] para=ana@ifce.edu.br assunto="Assunto"')
    })

    it('não registra o código do OTP', async () => {
      await service.sendOtpCode({
        to: 'ana@ifce.edu.br',
        code: '482913',
        purpose: 'SIGN_IN',
        expiresInMinutes: 10,
      })
      expect(log).toHaveBeenCalledWith(
        '[mail desligado] para=ana@ifce.edu.br assunto="Seu código de acesso ao schdlr"',
      )
      expect(logged(log, warn, error)).not.toContain('482913')
    })

    it('não registra o token do convite', async () => {
      await service.sendUnitInvitation({
        to: 'nova@ifce.edu.br',
        inviterName: 'Admin',
        unitName: 'Sede',
        organizationName: 'Acme',
        isManager: false,
        isTeacher: true,
        acceptUrl: 'http://web/invitations/token-secreto?action=accept',
        rejectUrl: 'http://web/invitations/token-secreto?action=reject',
        expiresAt: new Date(),
      })
      expect(log).toHaveBeenCalledWith(
        '[mail desligado] para=nova@ifce.edu.br assunto="Convite para a unidade Sede no schdlr"',
      )
      expect(logged(log, warn, error)).not.toContain('token-secreto')
    })
  })

  describe('com MAIL_ENABLED=true', () => {
    let transport: { sendMail: jest.Mock; verify: jest.Mock }
    let service: MailService

    beforeEach(() => {
      transport = { sendMail: jest.fn().mockResolvedValue({}), verify: jest.fn() }
      service = new MailService(transport, config)
    })

    it('envia com o MAIL_FROM e registra o envio', async () => {
      await service.send(message)
      expect(transport.sendMail).toHaveBeenCalledWith({ from: 'noreply@schdlr.test', ...message })
      expect(log).toHaveBeenCalledWith('[mail enviado] para=ana@ifce.edu.br assunto="Assunto"')
    })

    it('registra error e rejeita quando o envio falha', async () => {
      transport.sendMail.mockRejectedValue(new Error('smtp fora'))
      await expect(service.send(message)).rejects.toThrow('smtp fora')
      expect(error).toHaveBeenCalledWith(expect.stringContaining('smtp fora'))
    })

    it('nunca registra o corpo', async () => {
      await service.send(message)
      transport.sendMail.mockRejectedValue(new Error('smtp fora'))
      await service.send(message).catch(() => undefined)
      expect(logged(log, warn, error)).not.toContain('corpo-secreto')
    })

    it('registra warn quando o verify falha, sem lançar', async () => {
      transport.verify.mockRejectedValue(new Error('Invalid login'))
      expect(() => service.onModuleInit()).not.toThrow()
      await new Promise((resolve) => setImmediate(resolve))
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Invalid login'))
    })
  })
})
