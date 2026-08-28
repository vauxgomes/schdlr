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
  Query,
} from '@nestjs/common'
import { Validate } from '../../common/decorators/validate.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { CurrentUnit } from '../units/decorators/unit-context.decorator'
import type { UnitContext } from '../units/unit-context'
import { CreateTimeSlotSchema } from './dto/create-time-slot.dto'
import { CreateTimetableSchema } from './dto/create-timetable.dto'
import { ListTimetablesSchema, SelectTimetablesSchema } from './dto/list-timetables.dto'
import { UpdateTimeSlotSchema } from './dto/update-time-slot.dto'
import { UpdateTimetableSchema } from './dto/update-timetable.dto'
import type { CreateTimeSlotInput } from './dto/create-time-slot.dto'
import type { CreateTimetableInput } from './dto/create-timetable.dto'
import type { ListTimetablesQuery, SelectTimetablesQuery } from './dto/list-timetables.dto'
import type { UpdateTimeSlotInput } from './dto/update-time-slot.dto'
import type { UpdateTimetableInput } from './dto/update-timetable.dto'
import { TimeSlotsService } from './time-slots.service'
import { TimetablesService } from './timetables.service'

@Controller('units/:unitId/timetables')
export class TimetablesController {
  constructor(private readonly timetablesService: TimetablesService) {}

  @Get('select')
  select(
    @CurrentUnit() context: UnitContext,
    @Query(new ZodValidationPipe(SelectTimetablesSchema, 'query')) query: SelectTimetablesQuery,
  ) {
    return this.timetablesService.select(context, query)
  }

  @Get()
  list(
    @CurrentUnit() context: UnitContext,
    @Query(new ZodValidationPipe(ListTimetablesSchema, 'query')) query: ListTimetablesQuery,
  ) {
    return this.timetablesService.list(context, query)
  }

  @Get(':timetableId')
  findOne(@CurrentUnit() context: UnitContext, @Param('timetableId') timetableId: string) {
    return this.timetablesService.findOne(context, timetableId)
  }

  @Post()
  @Validate(CreateTimetableSchema)
  create(@CurrentUnit() context: UnitContext, @Body() input: CreateTimetableInput) {
    return this.timetablesService.create(context, input)
  }

  @Patch(':timetableId')
  @Validate(UpdateTimetableSchema)
  update(
    @CurrentUnit() context: UnitContext,
    @Param('timetableId') timetableId: string,
    @Body() input: UpdateTimetableInput,
  ) {
    return this.timetablesService.update(context, timetableId, input)
  }

  @Delete(':timetableId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUnit() context: UnitContext, @Param('timetableId') timetableId: string) {
    return this.timetablesService.remove(context, timetableId)
  }
}

@Controller('units/:unitId/timetables/:timetableId/time-slots')
export class TimeSlotsController {
  constructor(private readonly timeSlotsService: TimeSlotsService) {}

  @Get()
  list(@CurrentUnit() context: UnitContext, @Param('timetableId') timetableId: string) {
    return this.timeSlotsService.list(context, timetableId)
  }

  @Post()
  @Validate(CreateTimeSlotSchema)
  create(
    @CurrentUnit() context: UnitContext,
    @Param('timetableId') timetableId: string,
    @Body() input: CreateTimeSlotInput,
  ) {
    return this.timeSlotsService.create(context, timetableId, input)
  }

  @Patch(':slotId')
  @Validate(UpdateTimeSlotSchema)
  update(
    @CurrentUnit() context: UnitContext,
    @Param('timetableId') timetableId: string,
    @Param('slotId') slotId: string,
    @Body() input: UpdateTimeSlotInput,
  ) {
    return this.timeSlotsService.update(context, timetableId, slotId, input)
  }

  @Delete(':slotId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUnit() context: UnitContext,
    @Param('timetableId') timetableId: string,
    @Param('slotId') slotId: string,
  ) {
    return this.timeSlotsService.remove(context, timetableId, slotId)
  }
}
