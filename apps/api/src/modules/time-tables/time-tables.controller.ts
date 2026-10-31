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

import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe'
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator'
import type { JwtPayload } from '@modules/auth/jwt-payload'

import {
  createTimeTableSchema,
  duplicateTimeTableSchema,
  updateTimeTableSchema,
  type CreateTimeTableInput,
  type DuplicateTimeTableInput,
  type UpdateTimeTableInput,
} from './schemas/time-table.schemas'
import { TimeTablesService } from './time-tables.service'

// Slugs e timeTableId do caminho são validados pelos services: fora do formato dá 404.
@Controller('organizations/:orgSlug/units/:unitSlug/time-tables')
export class TimeTablesController {
  constructor(private readonly timeTables: TimeTablesService) {}

  @Post()
  create(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Body(new ZodValidationPipe(createTimeTableSchema)) body: CreateTimeTableInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.timeTables.create(user.sub, orgSlug, unitSlug, body)
  }

  @Get()
  list(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.timeTables.list(user.sub, orgSlug, unitSlug)
  }

  @Get(':timeTableId')
  get(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('timeTableId') timeTableId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.timeTables.get(user.sub, orgSlug, unitSlug, timeTableId)
  }

  @Patch(':timeTableId')
  update(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('timeTableId') timeTableId: string,
    @Body(new ZodValidationPipe(updateTimeTableSchema)) body: UpdateTimeTableInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.timeTables.update(user.sub, orgSlug, unitSlug, timeTableId, body)
  }

  @Delete(':timeTableId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('timeTableId') timeTableId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.timeTables.remove(user.sub, orgSlug, unitSlug, timeTableId)
  }

  @Post(':timeTableId/duplicate')
  duplicate(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('timeTableId') timeTableId: string,
    @Body(new ZodValidationPipe(duplicateTimeTableSchema)) body: DuplicateTimeTableInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.timeTables.duplicate(user.sub, orgSlug, unitSlug, timeTableId, body)
  }
}
