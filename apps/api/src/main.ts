import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'

import { Env } from '@config/env.schema'

import { AppModule } from './app.module'
import { configureApp } from './app.setup'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  configureApp(app)

  const config = app.get<ConfigService<Env, true>>(ConfigService)
  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0')
}

void bootstrap()
