import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Env } from '../../config/env'
import { MailListener } from './mail.listener'
import { MailService } from './mail.service'

// O listener só lê WEB_APP_URL, e apenas no caminho de convite.
const config = { get: () => 'http://localhost:3000' } as unknown as ConfigService<Env, true>

describe('MailListener', () => {
  const payload = { name: 'Developer', email: 'developer@schdlr.test' }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
  })

  it('sends the welcome template to the address in the payload', async () => {
    const send = jest.fn().mockResolvedValue(undefined)

    await new MailListener({ send } as unknown as MailService, config).handleUserRegistered(payload)

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'developer@schdlr.test', subject: 'Bem-vindo ao schdlr' }),
    )
  })

  // A garantia que a spec exige: SMTP fora do ar não pode virar exceção para
  // quem emitiu o evento, senão um cadastro que deu certo responderia erro.
  it('swallows a delivery failure', async () => {
    const send = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const listener = new MailListener({ send } as unknown as MailService, config)

    await expect(listener.handleUserRegistered(payload)).resolves.toBeUndefined()
  })
})
