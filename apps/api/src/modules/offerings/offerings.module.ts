import { Module } from '@nestjs/common'

import { ProjectsModule } from '@modules/projects/projects.module'

import { OfferingsController } from './offerings.controller'
import { OfferingsService } from './offerings.service'

/** As ofertas de um projeto (spec 0019). */
@Module({
  imports: [ProjectsModule],
  controllers: [OfferingsController],
  providers: [OfferingsService],
})
export class OfferingsModule {}
