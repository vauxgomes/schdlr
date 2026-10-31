import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common'

import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe'
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator'
import type { JwtPayload } from '@modules/auth/jwt-payload'

import {
  createTimeSlotSchema,
  updateTimeSlotSchema,
  type CreateTimeSlotInput,
  type UpdateTimeSlotInput,
} from './schemas/time-slot.schemas'
import { TimeSlotsService } from './time-slots.service'

// Slugs e ids do caminho são validados pelos services: fora do formato dá 404.
@Controller('organizations/:orgSlug/units/:unitSlug/time-tables/:timeTableId/slots')
export class TimeSlotsController {
  constructor(private readonly timeSlots: TimeSlotsService) {}

  @Post()
  create(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('timeTableId') timeTableId: string,
    @Body(new ZodValidationPipe(createTimeSlotSchema)) body: CreateTimeSlotInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.timeSlots.create(user.sub, orgSlug, unitSlug, timeTableId, body)
  }

  @Patch(':slotId')
  update(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('timeTableId') timeTableId: string,
    @Param('slotId') slotId: string,
    @Body(new ZodValidationPipe(updateTimeSlotSchema)) body: UpdateTimeSlotInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.timeSlots.update(user.sub, orgSlug, unitSlug, timeTableId, slotId, body)
  }

  @Delete(':slotId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('timeTableId') timeTableId: string,
    @Param('slotId') slotId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.timeSlots.remove(user.sub, orgSlug, unitSlug, timeTableId, slotId)
  }
}
