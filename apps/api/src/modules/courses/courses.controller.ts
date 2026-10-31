import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common'

import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe'
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator'
import type { JwtPayload } from '@modules/auth/jwt-payload'

import { CoursesService } from './courses.service'
import {
  createCourseSchema,
  updateCourseSchema,
  type CreateCourseInput,
  type UpdateCourseInput,
} from './schemas/course.schemas'

// Slugs e courseId do caminho são validados pelos services de acesso: fora do formato dá 404.
@Controller('organizations/:orgSlug/units/:unitSlug/courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Post()
  create(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Body(new ZodValidationPipe(createCourseSchema)) body: CreateCourseInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.courses.create(user.sub, orgSlug, unitSlug, body)
  }

  @Get()
  list(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.courses.list(user.sub, orgSlug, unitSlug)
  }

  @Get(':courseId')
  get(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('courseId') courseId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.courses.get(user.sub, orgSlug, unitSlug, courseId)
  }

  @Patch(':courseId')
  update(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('courseId') courseId: string,
    @Body(new ZodValidationPipe(updateCourseSchema)) body: UpdateCourseInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.courses.update(user.sub, orgSlug, unitSlug, courseId, body)
  }
}
