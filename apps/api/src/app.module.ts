import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'

import { validateEnv } from '@config/env.schema'
import { DatabaseModule } from '@infra/database/database.module'
import { MailModule } from '@infra/mail/mail.module'
import { AuthModule } from '@modules/auth/auth.module'
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard'
import { SystemRoleGuard } from '@modules/auth/guards/system-role.guard'
import { HealthModule } from '@modules/health/health.module'
import { OrganizationsModule } from '@modules/organizations/organizations.module'
import { ProfileModule } from '@modules/profile/profile.module'
import { SubscriptionsModule } from '@modules/subscriptions/subscriptions.module'
import { UsersModule } from '@modules/users/users.module'

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
    SubscriptionsModule,
    UsersModule,
    ProfileModule,
    OrganizationsModule,
  ],
  // A ordem importa: o SystemRoleGuard lê o usuário que o JwtAuthGuard pôs na requisição.
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: SystemRoleGuard },
  ],
})
export class AppModule {}
