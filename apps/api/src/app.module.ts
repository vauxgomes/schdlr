import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { validateEnv } from './config/env'
import { AuditModule } from './infra/audit/audit.module'
import { DatabaseModule } from './infra/database/database.module'
import { MailModule } from './infra/mail/mail.module'
import { AuthModule } from './modules/auth/auth.module'
import { CoursesModule } from './modules/courses/courses.module'
import { HealthModule } from './modules/health/health.module'
import { InvitesModule } from './modules/invites/invites.module'
import { MembersModule } from './modules/members/members.module'
import { NotificationsModule } from './modules/notifications/notifications.module'
import { OrganizationsModule } from './modules/organizations/organizations.module'
import { UnitsModule } from './modules/units/units.module'
import { UsersModule } from './modules/users/users.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    AuditModule,
    MailModule,
    AuthModule,
    CoursesModule,
    HealthModule,
    InvitesModule,
    MembersModule,
    NotificationsModule,
    OrganizationsModule,
    UnitsModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
