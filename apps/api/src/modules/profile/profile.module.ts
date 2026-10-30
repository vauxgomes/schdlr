import { Module } from '@nestjs/common'

import { SubscriptionsModule } from '@modules/subscriptions/subscriptions.module'

import { ProfileController } from './profile.controller'
import { ProfileService } from './profile.service'

@Module({
  imports: [SubscriptionsModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
