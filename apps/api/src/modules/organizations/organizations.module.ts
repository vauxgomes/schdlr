import { Module } from '@nestjs/common'

import { SubscriptionsModule } from '@modules/subscriptions/subscriptions.module'

import { OrganizationsController } from './organizations.controller'
import { OrganizationsService } from './organizations.service'
import { TenantAccessService } from './tenant-access.service'
import { UnitsController } from './units.controller'
import { UnitsService } from './units.service'

@Module({
  imports: [SubscriptionsModule],
  controllers: [OrganizationsController, UnitsController],
  providers: [OrganizationsService, UnitsService, TenantAccessService],
  exports: [TenantAccessService],
})
export class OrganizationsModule {}
