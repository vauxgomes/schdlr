import { Module } from '@nestjs/common'

import { TenancyModule } from '@modules/tenancy/tenancy.module'

import { InvitationsController } from './invitations.controller'
import { InvitationsService } from './invitations.service'
import { UnitInvitationsController } from './unit-invitations.controller'

@Module({
  imports: [TenancyModule],
  controllers: [UnitInvitationsController, InvitationsController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
