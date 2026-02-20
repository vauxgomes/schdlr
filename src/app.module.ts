import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AccountsModule } from './accounts/accounts.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { MembersModule } from './members/members.module';
import { DisciplinesModule } from './disciplines/disciplines.module';
import { CoursesModule } from './courses/courses.module';
import { CurriculumsModule } from './curriculums/curriculums.module';
import { LocationsModule } from './locations/locations.module';
import { TimeSlotsModule } from './time-slots/time-slots.module';
import { TermsModule } from './terms/terms.module';

@Module({
  imports: [UsersModule, AccountsModule, SubscriptionsModule, OrganizationsModule, MembersModule, DisciplinesModule, CoursesModule, CurriculumsModule, LocationsModule, TimeSlotsModule, TermsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
