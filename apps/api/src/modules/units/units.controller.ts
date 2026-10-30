import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common'

import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe'
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator'
import type { JwtPayload } from '@modules/auth/jwt-payload'

import {
  createUnitSchema,
  updateUnitSchema,
  type CreateUnitInput,
  type UpdateUnitInput,
} from './schemas/unit.schemas'
import { UnitsService } from './units.service'

// Os slugs do caminho são validados pelo TenantAccessService: fora do formato dá 404, não 400.
@Controller('organizations/:orgSlug/units')
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @Post()
  create(
    @Param('orgSlug') orgSlug: string,
    @Body(new ZodValidationPipe(createUnitSchema)) body: CreateUnitInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.units.create(user.sub, orgSlug, body)
  }

  @Get()
  list(@Param('orgSlug') orgSlug: string, @CurrentUser() user: JwtPayload) {
    return this.units.list(user.sub, orgSlug)
  }

  @Get(':unitSlug')
  get(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.units.get(user.sub, orgSlug, unitSlug)
  }

  @Patch(':unitSlug')
  update(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Body(new ZodValidationPipe(updateUnitSchema)) body: UpdateUnitInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.units.update(user.sub, orgSlug, unitSlug, body)
  }
}
