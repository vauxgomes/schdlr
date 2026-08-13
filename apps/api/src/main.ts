import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { configureApp } from './app.setup'
import { Env } from './config/env'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const config = app.get(ConfigService<Env, true>)

  configureApp(app, config.get('CORS_ORIGIN', { infer: true }))

  await app.listen(config.get('PORT', { infer: true }))
}

void bootstrap()
