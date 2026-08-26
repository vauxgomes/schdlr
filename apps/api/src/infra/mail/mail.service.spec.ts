import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createTransport } from 'nodemailer'
import { Env } from '../../config/env'
import { MailService } from './mail.service'

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }))

const createTransportMock = createTransport as jest.MockedFunction<typeof createTransport>

function buildService(env: Partial<Env>) {
  const config = { get: (key: keyof Env) => env[key] } as unknown as ConfigService<Env, true>

  return new MailService(config)
}

describe('MailService', () => {
  const message = { to: 'developer@schdlr.test', subject: 'Hello', html: '<p>Hi</p>' }
  let log: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
  })

  describe('without SMTP_HOST', () => {
    it('builds no transport at all', () => {
      buildService({}).onModuleInit()

      expect(createTransportMock).not.toHaveBeenCalled()
    })

    it('logs the message instead of sending, and does not throw', async () => {
      const service = buildService({})
      service.onModuleInit()

      await expect(service.send(message)).resolves.toBeUndefined()
      expect(log).toHaveBeenCalledWith(expect.stringContaining('developer@schdlr.test'))
    })
  })

  describe('with SMTP_HOST', () => {
    const env: Partial<Env> = {
      SMTP_HOST: 'smtp.schdlr.test',
      SMTP_PORT: 587,
      SMTP_SECURE: false,
      MAIL_FROM: 'schdlr <no-reply@schdlr.test>',
    }

    it('omits auth when there are no credentials', () => {
      buildService(env).onModuleInit()

      expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({ auth: undefined }))
    })

    it('sends through the transport, using MAIL_FROM', async () => {
      const sendMail = jest.fn().mockResolvedValue({})
      createTransportMock.mockReturnValue({ sendMail } as never)

      const service = buildService(env)
      service.onModuleInit()
      await service.send(message)

      expect(sendMail).toHaveBeenCalledWith({
        from: 'schdlr <no-reply@schdlr.test>',
        to: message.to,
        subject: message.subject,
        html: message.html,
      })
    })

    it('lets a transport failure surface, for the listener to absorb', async () => {
      const sendMail = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))
      createTransportMock.mockReturnValue({ sendMail } as never)

      const service = buildService(env)
      service.onModuleInit()

      await expect(service.send(message)).rejects.toThrow('ECONNREFUSED')
    })
  })
})
