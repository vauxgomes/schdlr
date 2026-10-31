import { Module } from '@nestjs/common'

import { TenancyModule } from '@modules/tenancy/tenancy.module'
import { TimeTablesModule } from '@modules/time-tables/time-tables.module'

import { TimeSlotsController } from './time-slots.controller'
import { TimeSlotsService } from './time-slots.service'

/** Horários de um bloco (spec 0017). */
@Module({
  imports: [TenancyModule, TimeTablesModule],
  controllers: [TimeSlotsController],
  providers: [TimeSlotsService],
})
export class TimeSlotsModule {}
