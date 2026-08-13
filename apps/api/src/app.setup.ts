import { INestApplication } from '@nestjs/common'
import cookieParser from 'cookie-parser'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'

// Montagem compartilhada entre o bootstrap e os testes end-to-end: se ficasse
// dentro do `bootstrap()`, o que o teste exercita não seria o que roda em produção.
export function configureApp(app: INestApplication, corsOrigin: string) {
  app.use(cookieParser())
  app.enableCors({ origin: corsOrigin, credentials: true })
  app.useGlobalFilters(new AllExceptionsFilter())
}
