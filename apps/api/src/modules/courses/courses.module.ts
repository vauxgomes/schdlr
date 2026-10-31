import { Module } from '@nestjs/common'

import { SubscriptionsModule } from '@modules/subscriptions/subscriptions.module'
import { TenancyModule } from '@modules/tenancy/tenancy.module'

import { CourseAccessService } from './course-access.service'
import { CoursesController } from './courses.controller'
import { CoursesService } from './courses.service'

/** Cursos da unidade e o acesso ao catálogo de um curso (spec 0011), para currículos e disciplinas. */
@Module({
  imports: [TenancyModule, SubscriptionsModule],
  controllers: [CoursesController],
  providers: [CoursesService, CourseAccessService],
  exports: [CourseAccessService],
})
export class CoursesModule {}
