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
  createSubjectSchema,
  updateSubjectSchema,
  type CreateSubjectInput,
  type UpdateSubjectInput,
} from './schemas/subject.schemas'
import { SubjectsService } from './subjects.service'

// Slugs e ids do caminho são validados pelos services de acesso: fora do formato dá 404.
@Controller(
  'organizations/:orgSlug/units/:unitSlug/courses/:courseId/curricula/:curriculumId/subjects',
)
export class SubjectsController {
  constructor(private readonly subjects: SubjectsService) {}

  @Post()
  create(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('courseId') courseId: string,
    @Param('curriculumId') curriculumId: string,
    @Body(new ZodValidationPipe(createSubjectSchema)) body: CreateSubjectInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.subjects.create(user.sub, orgSlug, unitSlug, courseId, curriculumId, body)
  }

  @Get()
  list(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('courseId') courseId: string,
    @Param('curriculumId') curriculumId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.subjects.list(user.sub, orgSlug, unitSlug, courseId, curriculumId)
  }

  @Get(':subjectId')
  get(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('courseId') courseId: string,
    @Param('curriculumId') curriculumId: string,
    @Param('subjectId') subjectId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.subjects.get(user.sub, orgSlug, unitSlug, courseId, curriculumId, subjectId)
  }

  @Patch(':subjectId')
  update(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('courseId') courseId: string,
    @Param('curriculumId') curriculumId: string,
    @Param('subjectId') subjectId: string,
    @Body(new ZodValidationPipe(updateSubjectSchema)) body: UpdateSubjectInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.subjects.update(
      user.sub,
      orgSlug,
      unitSlug,
      courseId,
      curriculumId,
      subjectId,
      body,
    )
  }

  @Delete(':subjectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('courseId') courseId: string,
    @Param('curriculumId') curriculumId: string,
    @Param('subjectId') subjectId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.subjects.remove(user.sub, orgSlug, unitSlug, courseId, curriculumId, subjectId)
  }
}
