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

@Module({
  imports: [UsersModule, AccountsModule, SubscriptionsModule, OrganizationsModule, MembersModule, DisciplinesModule, CoursesModule, CurriculumsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
