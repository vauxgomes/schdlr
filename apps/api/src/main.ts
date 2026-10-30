import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'

import { Env } from '@config/env.schema'

import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const config = app.get<ConfigService<Env, true>>(ConfigService)

  app.setGlobalPrefix('api')
  app.enableCors({ origin: config.get('CORS_ORIGIN', { infer: true }), credentials: true })
  app.enableShutdownHooks()

  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0')
}

void bootstrap()
