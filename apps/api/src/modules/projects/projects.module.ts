import { Module } from '@nestjs/common'

import { TenancyModule } from '@modules/tenancy/tenancy.module'
import { TermsModule } from '@modules/terms/terms.module'

import { ProjectAccessService } from './project-access.service'
import { ProjectsController } from './projects.controller'
import { ProjectsService } from './projects.service'

/** Projetos de horários e o acesso a um projeto (spec 0018), para ofertas e quadros. */
@Module({
  imports: [TenancyModule, TermsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectAccessService],
  exports: [ProjectAccessService],
})
export class ProjectsModule {}
