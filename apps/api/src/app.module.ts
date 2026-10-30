import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'

import { validateEnv } from '@config/env.schema'
import { DatabaseModule } from '@infra/database/database.module'
import { MailModule } from '@infra/mail/mail.module'
import { AuthModule } from '@modules/auth/auth.module'
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard'
import { HealthModule } from '@modules/health/health.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateEnv,
    }),
    DatabaseModule,
    MailModule,
    AuthModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
