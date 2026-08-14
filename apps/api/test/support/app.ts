import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { App } from 'supertest/types'
import { AppModule } from '../../src/app.module'
import { configureApp } from '../../src/app.setup'
import { DatabaseService } from '../../src/infra/database/database.service'

export type TestContext = {
  app: INestApplication<App>
  db: DatabaseService
}

// Sobe a app com a mesma montagem do bootstrap, apontada para o banco de teste
// pelo DATABASE_URL que o load-env já colocou no processo.
export async function createTestApp(): Promise<TestContext> {
  const fixture = await Test.createTestingModule({ imports: [AppModule] }).compile()
  const app = fixture.createNestApplication<INestApplication<App>>()

  configureApp(app, 'http://localhost:3000')
  await app.init()

  return { app, db: app.get(DatabaseService) }
}
