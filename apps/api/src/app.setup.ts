import { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import cookieParser from 'cookie-parser'

import { Env } from '@config/env.schema'

/** Tudo o que a app precisa além dos módulos. O main.ts e os e2e chamam o mesmo. */
export function configureApp(app: INestApplication) {
  const config = app.get<ConfigService<Env, true>>(ConfigService)

  app.setGlobalPrefix('api')
  app.enableCors({ origin: config.get('CORS_ORIGIN', { infer: true }), credentials: true })
  app.use(cookieParser())
  app.enableShutdownHooks()
}
