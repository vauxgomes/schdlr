import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common'
import { Validate } from '../../common/decorators/validate.decorator'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy'
import { CurrentUnit } from './decorators/unit-context.decorator'
import { CreateUnitSchema } from './dto/create-unit.dto'
import { UpdateUnitSchema } from './dto/update-unit.dto'
import type { CreateUnitInput } from './dto/create-unit.dto'
import type { UpdateUnitInput } from './dto/update-unit.dto'
import type { UnitContext } from './unit-context'
import { UnitsService } from './units.service'

@Controller('organizations/:organizationId/units')
export class OrganizationUnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Post()
  @Validate(CreateUnitSchema)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Body() input: CreateUnitInput,
  ) {
    return this.unitsService.create(user.userId, organizationId, input)
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('organizationId') organizationId: string) {
    return this.unitsService.listByOrganization(user.userId, organizationId)
  }
}

@Controller('units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  // Antes de :unitId, senão 'select' é lido como id — e o guard tentaria
  // resolver uma unidade chamada "select".
  @Get('select')
  select(@CurrentUser() user: AuthenticatedUser) {
    return this.unitsService.select(user.userId)
  }

  @Get(':unitId')
  findOne(@CurrentUnit() context: UnitContext) {
    return this.unitsService.findOne(context)
  }

  @Patch(':unitId')
  @Validate(UpdateUnitSchema)
  update(@CurrentUnit() context: UnitContext, @Body() input: UpdateUnitInput) {
    return this.unitsService.update(context, input)
  }

  @Delete(':unitId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUnit() context: UnitContext) {
    return this.unitsService.remove(context)
  }
}
