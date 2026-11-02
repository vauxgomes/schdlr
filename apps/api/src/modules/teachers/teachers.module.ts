import { Module } from '@nestjs/common'

import { TenancyModule } from '@modules/tenancy/tenancy.module'

import { TeachersController } from './teachers.controller'
import { TeachersService } from './teachers.service'

/** Professores da organização (spec 0021). */
@Module({
  imports: [TenancyModule],
  controllers: [TeachersController],
  providers: [TeachersService],
})
export class TeachersModule {}
