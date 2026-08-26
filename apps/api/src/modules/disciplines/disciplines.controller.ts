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
import { DisciplinesService } from './disciplines.service'
import { CreateDisciplineSchema } from './dto/create-discipline.dto'
import { ListDisciplinesSchema } from './dto/list-disciplines.dto'
import { UpdateDisciplineSchema } from './dto/update-discipline.dto'
import type { CreateDisciplineInput } from './dto/create-discipline.dto'
import type { ListDisciplinesQuery } from './dto/list-disciplines.dto'
import type { UpdateDisciplineInput } from './dto/update-discipline.dto'

@Controller('units/:unitId/disciplines')
export class DisciplinesController {
  constructor(private readonly disciplinesService: DisciplinesService) {}

  @Get('select')
  select(@CurrentUnit() context: UnitContext) {
    return this.disciplinesService.select(context)
  }

  @Get()
  list(
    @CurrentUnit() context: UnitContext,
    @Query(new ZodValidationPipe(ListDisciplinesSchema, 'query')) query: ListDisciplinesQuery,
  ) {
    return this.disciplinesService.list(context, query)
  }

  @Get(':disciplineId')
  findOne(@CurrentUnit() context: UnitContext, @Param('disciplineId') disciplineId: string) {
    return this.disciplinesService.findOne(context, disciplineId)
  }

  @Post()
  @Validate(CreateDisciplineSchema)
  create(@CurrentUnit() context: UnitContext, @Body() input: CreateDisciplineInput) {
    return this.disciplinesService.create(context, input)
  }

  @Patch(':disciplineId')
  @Validate(UpdateDisciplineSchema)
  update(
    @CurrentUnit() context: UnitContext,
    @Param('disciplineId') disciplineId: string,
    @Body() input: UpdateDisciplineInput,
  ) {
    return this.disciplinesService.update(context, disciplineId, input)
  }

  @Delete(':disciplineId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUnit() context: UnitContext, @Param('disciplineId') disciplineId: string) {
    return this.disciplinesService.remove(context, disciplineId)
  }
}
