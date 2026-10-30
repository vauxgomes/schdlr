import { Module } from '@nestjs/common'

import { SubscriptionsModule } from '@modules/subscriptions/subscriptions.module'
import { TenancyModule } from '@modules/tenancy/tenancy.module'

import { UnitsController } from './units.controller'
import { UnitsService } from './units.service'

@Module({
  imports: [TenancyModule, SubscriptionsModule],
  controllers: [UnitsController],
  providers: [UnitsService],
})
export class UnitsModule {}
