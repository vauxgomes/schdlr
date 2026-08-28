import { Module } from '@nestjs/common'
import { TimeSlotsService } from './time-slots.service'
import { TimeSlotsController, TimetablesController } from './timetables.controller'
import { TimetablesService } from './timetables.service'

@Module({
  controllers: [TimetablesController, TimeSlotsController],
  providers: [TimetablesService, TimeSlotsService],
})
export class TimetablesModule {}
