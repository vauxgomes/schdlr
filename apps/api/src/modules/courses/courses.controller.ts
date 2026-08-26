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
import { CoursesService } from './courses.service'
import { CreateCourseSchema } from './dto/create-course.dto'
import { ListCoursesSchema } from './dto/list-courses.dto'
import { UpdateCourseSchema } from './dto/update-course.dto'
import type { CreateCourseInput } from './dto/create-course.dto'
import type { ListCoursesQuery } from './dto/list-courses.dto'
import type { UpdateCourseInput } from './dto/update-course.dto'

@Controller('units/:unitId/courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  // Antes de :courseId, senão 'select' é lido como id.
  @Get('select')
  select(@CurrentUnit() context: UnitContext) {
    return this.coursesService.select(context)
  }

  // Pipe no parâmetro, e não `@Validate`: aquele decorator ocupa o `UsePipes`
  // do handler, que é um só — corpo e query brigariam pelo mesmo lugar.
  @Get()
  list(
    @CurrentUnit() context: UnitContext,
    @Query(new ZodValidationPipe(ListCoursesSchema, 'query')) query: ListCoursesQuery,
  ) {
    return this.coursesService.list(context, query)
  }

  @Get(':courseId')
  findOne(@CurrentUnit() context: UnitContext, @Param('courseId') courseId: string) {
    return this.coursesService.findOne(context, courseId)
  }

  @Post()
  @Validate(CreateCourseSchema)
  create(@CurrentUnit() context: UnitContext, @Body() input: CreateCourseInput) {
    return this.coursesService.create(context, input)
  }

  @Patch(':courseId')
  @Validate(UpdateCourseSchema)
  update(
    @CurrentUnit() context: UnitContext,
    @Param('courseId') courseId: string,
    @Body() input: UpdateCourseInput,
  ) {
    return this.coursesService.update(context, courseId, input)
  }

  @Delete(':courseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUnit() context: UnitContext, @Param('courseId') courseId: string) {
    return this.coursesService.remove(context, courseId)
  }
}
