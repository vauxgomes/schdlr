import { Module } from '@nestjs/common'

import { TenancyModule } from '@modules/tenancy/tenancy.module'

import { TermAccessService } from './term-access.service'
import { TermsController } from './terms.controller'
import { TermsService } from './terms.service'

/** Semestres da unidade e o acesso a um semestre (spec 0016), para projetos, ofertas e quadros. */
@Module({
  imports: [TenancyModule],
  controllers: [TermsController],
  providers: [TermsService, TermAccessService],
  exports: [TermAccessService],
})
export class TermsModule {}
