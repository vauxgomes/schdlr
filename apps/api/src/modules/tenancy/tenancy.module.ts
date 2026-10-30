import { Module } from '@nestjs/common'

import { SubscriptionsModule } from '@modules/subscriptions/subscriptions.module'

import { TenantAccessService } from './tenant-access.service'

/** Acesso a organização e unidade (spec 0009), para todo módulo com dado de tenant. */
@Module({
  imports: [SubscriptionsModule],
  providers: [TenantAccessService],
  exports: [TenantAccessService],
})
export class TenancyModule {}
