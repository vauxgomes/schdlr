import { Module } from '@nestjs/common'

import { TenancyModule } from '@modules/tenancy/tenancy.module'

import { LocationsController } from './locations.controller'
import { LocationsService } from './locations.service'

/** Locais da unidade (spec 0015). */
@Module({
  imports: [TenancyModule],
  controllers: [LocationsController],
  providers: [LocationsService],
})
export class LocationsModule {}
