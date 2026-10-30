import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'

import { DatabaseService } from '@infra/database/database.service'

import { AppModule } from '../src/app.module'

describe('GET /api/health', () => {
  let app: INestApplication<App>
  const database = { $queryRaw: jest.fn() }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue(database)
      .compile()

    app = moduleRef.createNestApplication()
    app.setGlobalPrefix('api')
    await app.init()
  })

  afterAll(() => app.close())

  it('responde 200 sem token quando o banco responde', async () => {
    database.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }])

    const res = await request(app.getHttpServer()).get('/api/health').expect(200)
    expect(res.body).toMatchObject({ status: 'ok', info: { database: { status: 'up' } } })
  })

  it('responde 503 quando o banco falha', async () => {
    database.$queryRaw.mockRejectedValueOnce(new Error('connection refused'))

    const res = await request(app.getHttpServer()).get('/api/health').expect(503)
    expect(res.body).toMatchObject({ status: 'error', error: { database: { status: 'down' } } })
  })
})
