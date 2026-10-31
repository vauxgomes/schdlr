import { Module } from '@nestjs/common'

import { TenancyModule } from '@modules/tenancy/tenancy.module'

import { TimeTablesController } from './time-tables.controller'
import { TimeTablesService } from './time-tables.service'

/** Blocos de horários da unidade (spec 0017). Exporta o service para os horários do bloco. */
@Module({
  imports: [TenancyModule],
  controllers: [TimeTablesController],
  providers: [TimeTablesService],
  exports: [TimeTablesService],
})
export class TimeTablesModule {}
