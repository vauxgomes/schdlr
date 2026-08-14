import { Logger } from '@nestjs/common'
import request from 'supertest'
import { MailService } from '../src/infra/mail/mail.service'
import { createTestApp, TestContext } from './support/app'
import { truncateAll } from './support/database'

const CREDENTIALS = { name: 'Vaux', email: 'vaux@schdlr.test', password: 'sup3r-secret' }

// Dá um tick para o listener assíncrono terminar: `emit` devolve antes da
// entrega, que é justamente o ponto de o e-mail não segurar a resposta.
const flush = () => new Promise((resolve) => setImmediate(resolve))

describe('Mail (e2e)', () => {
  let context: TestContext
  let send: jest.SpyInstance

  const register = () =>
    request(context.app.getHttpServer()).post('/auth/register').send(CREDENTIALS)

  beforeAll(async () => {
    context = await createTestApp()
  })

  beforeEach(async () => {
    await truncateAll(context.db)
    send = jest.spyOn(context.app.get(MailService), 'send').mockResolvedValue(undefined)
  })

  afterEach(() => {
    send.mockRestore()
  })

  afterAll(async () => {
    await context.app.close()
  })

  it('sends the welcome mail when a user registers', async () => {
    await register()
    await flush()

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: CREDENTIALS.email, subject: 'Bem-vindo ao schdlr' }),
    )
  })

  it('keeps the registration successful when delivery fails', async () => {
    // O listener registra a falha; aqui ela é esperada, então não polui a saída.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    send.mockRejectedValue(new Error('ECONNREFUSED'))

    const response = await register()
    await flush()

    expect(response.status).toBe(201)

    const user = await context.db.user.findUnique({ where: { email: CREDENTIALS.email } })

    expect(user).not.toBeNull()
  })

  it('does not send anything when the registration is refused', async () => {
    await register()
    await flush()
    send.mockClear()

    const duplicate = await register()
    await flush()

    expect(duplicate.status).toBe(409)
    expect(send).not.toHaveBeenCalled()
  })
})
