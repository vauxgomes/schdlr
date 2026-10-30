import { Controller, Get, INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'

import { AuthModule } from '../auth.module'
import { CurrentUser } from '../decorators/current-user.decorator'
import { Public } from '../decorators/public.decorator'
import type { JwtPayload } from '../jwt-payload'
import { JwtAuthGuard } from './jwt-auth.guard'

@Controller()
class TestController {
  @Public()
  @Get('public')
  open() {
    return { ok: true }
  }

  @Get('private')
  me(@CurrentUser() user: JwtPayload) {
    return user
  }
}

describe('JwtAuthGuard', () => {
  let app: INestApplication<App>
  let jwt: JwtService

  beforeAll(async () => {
    const env: Record<string, string> = {
      JWT_SECRET: 'x'.repeat(32),
      JWT_EXPIRES_IN: '15m',
    }
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [TestController],
      providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
    })
      .useMocker((token) => {
        if (token === ConfigService) return { get: (key: string) => env[key] }
      })
      .compile()

    app = moduleRef.createNestApplication()
    await app.init()
    jwt = moduleRef.get(JwtService)
  })

  afterAll(() => app.close())

  it('deixa passar rota @Public() sem token', async () => {
    await request(app.getHttpServer()).get('/public').expect(200, { ok: true })
  })

  it('devolve 401 em rota comum sem token', async () => {
    await request(app.getHttpServer()).get('/private').expect(401)
  })

  it('devolve 401 com token assinado por outro segredo', async () => {
    const token = jwt.sign({ sub: 'user-1' }, { secret: 'y'.repeat(32) })
    await request(app.getHttpServer())
      .get('/private')
      .set('Authorization', `Bearer ${token}`)
      .expect(401)
  })

  it('popula @CurrentUser() com o payload de um token válido', async () => {
    const token = jwt.sign({ sub: 'user-1' })
    await request(app.getHttpServer())
      .get('/private')
      .set('Authorization', `Bearer ${token}`)
      .expect(200, { sub: 'user-1' })
  })
})
