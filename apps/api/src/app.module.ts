import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'

import { validateEnv } from '@config/env.schema'
import { DatabaseModule } from '@infra/database/database.module'
import { MailModule } from '@infra/mail/mail.module'
import { AuthModule } from '@modules/auth/auth.module'
import { CoursesModule } from '@modules/courses/courses.module'
import { CurriculaModule } from '@modules/curricula/curricula.module'
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard'
import { SystemRoleGuard } from '@modules/auth/guards/system-role.guard'
import { HealthModule } from '@modules/health/health.module'
import { InvitationsModule } from '@modules/invitations/invitations.module'
import { LocationsModule } from '@modules/locations/locations.module'
import { MembersModule } from '@modules/members/members.module'
import { OfferingsModule } from '@modules/offerings/offerings.module'
import { OrganizationsModule } from '@modules/organizations/organizations.module'
import { ProfileModule } from '@modules/profile/profile.module'
import { ProjectsModule } from '@modules/projects/projects.module'
import { SubjectsModule } from '@modules/subjects/subjects.module'
import { SubscriptionsModule } from '@modules/subscriptions/subscriptions.module'
import { TermsModule } from '@modules/terms/terms.module'
import { TimeSlotsModule } from '@modules/time-slots/time-slots.module'
import { TimeTablesModule } from '@modules/time-tables/time-tables.module'
import { UnitsModule } from '@modules/units/units.module'
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
    UnitsModule,
    MembersModule,
    InvitationsModule,
    CoursesModule,
    CurriculaModule,
    SubjectsModule,
    LocationsModule,
    TermsModule,
    TimeTablesModule,
    TimeSlotsModule,
    ProjectsModule,
    OfferingsModule,
  ],
  // A ordem importa: o SystemRoleGuard lê o usuário que o JwtAuthGuard pôs na requisição.
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: SystemRoleGuard },
  ],
})
export class AppModule {}
