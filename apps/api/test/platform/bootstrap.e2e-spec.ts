import { Body, Controller, Get, INestApplication, Module, Post, Req } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'
import { z } from 'zod'

import type { Request } from 'express'
import { configureApp } from '../../src/app.setup'
import { Validate } from '../../src/common/decorators/validate.decorator'

const ProbeSchema = z.object({ name: z.string().min(3), age: z.coerce.number().int() })

type ErrorBody = { statusCode: number; message: string; issues?: { field: string }[] }

// Controller de sonda em vez do AppModule: o alvo aqui é a montagem HTTP
// (validação, corpo de erro, cookies), que não deve depender de banco.
@Controller('probe')
class ProbeController {
  @Post()
  @Validate(ProbeSchema)
  create(@Body() body: unknown) {
    return body
  }

  @Get('cookies')
  cookies(@Req() request: Request) {
    return request.cookies as unknown
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('Bootstrap (e2e)', () => {
  let app: INestApplication<App>

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({ imports: [ProbeModule] }).compile()

    app = fixture.createNestApplication()
    configureApp(app, 'http://localhost:3000')
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('answers 400 with the offending fields', async () => {
    const response = await request(app.getHttpServer()).post('/probe').send({ name: 'ab' })
    const body = response.body as ErrorBody

    expect(response.status).toBe(400)
    expect(body.message).toBe('Invalid request body')
    expect(body.issues?.map((issue) => issue.field)).toEqual(['name', 'age'])
  })

  it('strips keys the schema does not declare', async () => {
    const response = await request(app.getHttpServer())
      .post('/probe')
      .send({ name: 'developer', age: 3, role: 'ADMIN' })

    expect(response.status).toBe(201)
    expect(response.body).toEqual({ name: 'developer', age: 3 })
  })

  it('parses cookies into the request', async () => {
    const response = await request(app.getHttpServer())
      .get('/probe/cookies')
      .set('Cookie', 'session=abc; theme=dark')

    expect(response.body).toEqual({ session: 'abc', theme: 'dark' })
  })

  it('normalizes an error raised outside a handler', async () => {
    const response = await request(app.getHttpServer()).get('/does-not-exist')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ statusCode: 404, message: 'Cannot GET /does-not-exist' })
  })

  it('allows the configured origin to send credentials', async () => {
    const response = await request(app.getHttpServer())
      .options('/probe')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000')
    expect(response.headers['access-control-allow-credentials']).toBe('true')
  })
})
