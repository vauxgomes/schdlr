import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { UnitMemberGuard } from './guards/unit-member.guard'
import { OrganizationUnitsController, UnitsController } from './units.controller'
import { UnitsService } from './units.service'

@Module({
  controllers: [OrganizationUnitsController, UnitsController],
  providers: [UnitsService, { provide: APP_GUARD, useClass: UnitMemberGuard }],
})
export class UnitsModule {}
