import { Module } from '@nestjs/common'
import { InvitesController, UnitInvitesController } from './invites.controller'
import { InvitesService } from './invites.service'

@Module({
  controllers: [UnitInvitesController, InvitesController],
  providers: [InvitesService],
})
export class InvitesModule {}
