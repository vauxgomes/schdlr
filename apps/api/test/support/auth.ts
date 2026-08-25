import request from 'supertest'
import { TestContext } from './app'

let sequence = 0

export type TestSession = {
  userId: string
  email: string
  accessToken: string
  refreshCookie: string
}

// Cria conta e abre sessão pela rota real, em vez de inserir linha na mão: o
// que o teste quer é um token que o guard aceite, e ele só sai daqui.
export async function registerAndLogin(context: TestContext): Promise<TestSession> {
  const email = `user${++sequence}-${Date.now()}@schdlr.test`
  const password = 'sup3r-secret'
  const server = () => request(context.app.getHttpServer())

  await server()
    .post('/auth/register')
    .send({ name: `User ${sequence}`, email, password })

  const response = await server().post('/auth/login').send({ email, password })
  const cookies = response.headers['set-cookie'] as unknown as string[]
  const { accessToken } = response.body as { accessToken: string }

  const user = await context.db.user.findUniqueOrThrow({ where: { email } })

  return {
    userId: user.id,
    email,
    accessToken,
    refreshCookie: cookies.find((cookie) => cookie.startsWith('refresh_token=')) as string,
  }
}
