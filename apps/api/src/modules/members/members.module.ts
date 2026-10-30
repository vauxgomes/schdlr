import { Module } from '@nestjs/common'

import { TenancyModule } from '@modules/tenancy/tenancy.module'

import { MembersController } from './members.controller'
import { MembersService } from './members.service'

@Module({
  imports: [TenancyModule],
  controllers: [MembersController],
  providers: [MembersService],
})
export class MembersModule {}
