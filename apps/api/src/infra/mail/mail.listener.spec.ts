import { Logger } from '@nestjs/common'
import { MailListener } from './mail.listener'
import { MailService } from './mail.service'

describe('MailListener', () => {
  const payload = { name: 'Vaux', email: 'vaux@schdlr.test' }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
  })

  it('sends the welcome template to the address in the payload', async () => {
    const send = jest.fn().mockResolvedValue(undefined)

    await new MailListener({ send } as unknown as MailService).handleWelcome(payload)

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'vaux@schdlr.test', subject: 'Bem-vindo ao schdlr' }),
    )
  })

  // A garantia que a spec exige: SMTP fora do ar não pode virar exceção para
  // quem emitiu o evento, senão um cadastro que deu certo responderia erro.
  it('swallows a delivery failure', async () => {
    const send = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const listener = new MailListener({ send } as unknown as MailService)

    await expect(listener.handleWelcome(payload)).resolves.toBeUndefined()
  })
})
