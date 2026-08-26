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
import { CurriculaService } from './curricula.service'
import { CurriculumDisciplinesService } from './curriculum-disciplines.service'
import { CreateCurriculumDisciplineSchema } from './dto/create-curriculum-discipline.dto'
import { CreateCurriculumSchema } from './dto/create-curriculum.dto'
import { ListCurriculaSchema } from './dto/list-curricula.dto'
import { UpdateCurriculumDisciplineSchema } from './dto/update-curriculum-discipline.dto'
import { UpdateCurriculumSchema } from './dto/update-curriculum.dto'
import type { CreateCurriculumDisciplineInput } from './dto/create-curriculum-discipline.dto'
import type { CreateCurriculumInput } from './dto/create-curriculum.dto'
import type { ListCurriculaQuery } from './dto/list-curricula.dto'
import type { UpdateCurriculumDisciplineInput } from './dto/update-curriculum-discipline.dto'
import type { UpdateCurriculumInput } from './dto/update-curriculum.dto'

@Controller('units/:unitId/courses/:courseId/curricula')
export class CurriculaController {
  constructor(private readonly curriculaService: CurriculaService) {}

  @Get()
  list(
    @CurrentUnit() context: UnitContext,
    @Param('courseId') courseId: string,
    @Query(new ZodValidationPipe(ListCurriculaSchema, 'query')) query: ListCurriculaQuery,
  ) {
    return this.curriculaService.list(context, courseId, query)
  }

  @Get(':curriculumId')
  findOne(
    @CurrentUnit() context: UnitContext,
    @Param('courseId') courseId: string,
    @Param('curriculumId') curriculumId: string,
  ) {
    return this.curriculaService.findOne(context, courseId, curriculumId)
  }

  @Post()
  @Validate(CreateCurriculumSchema)
  create(
    @CurrentUnit() context: UnitContext,
    @Param('courseId') courseId: string,
    @Body() input: CreateCurriculumInput,
  ) {
    return this.curriculaService.create(context, courseId, input)
  }

  @Patch(':curriculumId')
  @Validate(UpdateCurriculumSchema)
  update(
    @CurrentUnit() context: UnitContext,
    @Param('courseId') courseId: string,
    @Param('curriculumId') curriculumId: string,
    @Body() input: UpdateCurriculumInput,
  ) {
    return this.curriculaService.update(context, courseId, curriculumId, input)
  }

  @Delete(':curriculumId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUnit() context: UnitContext,
    @Param('courseId') courseId: string,
    @Param('curriculumId') curriculumId: string,
  ) {
    return this.curriculaService.remove(context, courseId, curriculumId)
  }
}

// A grade mora sob o currículo, que mora sob o curso: a rota reflete a FK
// composta, do mesmo jeito que a decisão da 0014 pede para o currículo.
@Controller('units/:unitId/courses/:courseId/curricula/:curriculumId/disciplines')
export class CurriculumDisciplinesController {
  constructor(private readonly itemsService: CurriculumDisciplinesService) {}

  @Get()
  list(
    @CurrentUnit() context: UnitContext,
    @Param('courseId') courseId: string,
    @Param('curriculumId') curriculumId: string,
  ) {
    return this.itemsService.list(context, courseId, curriculumId)
  }

  @Post()
  @Validate(CreateCurriculumDisciplineSchema)
  create(
    @CurrentUnit() context: UnitContext,
    @Param('courseId') courseId: string,
    @Param('curriculumId') curriculumId: string,
    @Body() input: CreateCurriculumDisciplineInput,
  ) {
    return this.itemsService.create(context, courseId, curriculumId, input)
  }

  @Patch(':itemId')
  @Validate(UpdateCurriculumDisciplineSchema)
  update(
    @CurrentUnit() context: UnitContext,
    @Param('courseId') courseId: string,
    @Param('curriculumId') curriculumId: string,
    @Param('itemId') itemId: string,
    @Body() input: UpdateCurriculumDisciplineInput,
  ) {
    return this.itemsService.update(context, courseId, curriculumId, itemId, input)
  }

  @Delete(':itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUnit() context: UnitContext,
    @Param('courseId') courseId: string,
    @Param('curriculumId') curriculumId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.itemsService.remove(context, courseId, curriculumId, itemId)
  }
}
