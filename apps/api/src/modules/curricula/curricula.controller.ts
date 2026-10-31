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

import { CurriculaService } from './curricula.service'
import {
  createCurriculumSchema,
  duplicateCurriculumSchema,
  updateCurriculumSchema,
  type CreateCurriculumInput,
  type DuplicateCurriculumInput,
  type UpdateCurriculumInput,
} from './schemas/curriculum.schemas'

// Slugs e ids do caminho são validados pelos services de acesso: fora do formato dá 404.
@Controller('organizations/:orgSlug/units/:unitSlug/courses/:courseId/curricula')
export class CurriculaController {
  constructor(private readonly curricula: CurriculaService) {}

  @Post()
  create(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('courseId') courseId: string,
    @Body(new ZodValidationPipe(createCurriculumSchema)) body: CreateCurriculumInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.curricula.create(user.sub, orgSlug, unitSlug, courseId, body)
  }

  @Get()
  list(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('courseId') courseId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.curricula.list(user.sub, orgSlug, unitSlug, courseId)
  }

  @Get(':curriculumId')
  get(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('courseId') courseId: string,
    @Param('curriculumId') curriculumId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.curricula.get(user.sub, orgSlug, unitSlug, courseId, curriculumId)
  }

  @Patch(':curriculumId')
  update(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('courseId') courseId: string,
    @Param('curriculumId') curriculumId: string,
    @Body(new ZodValidationPipe(updateCurriculumSchema)) body: UpdateCurriculumInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.curricula.update(user.sub, orgSlug, unitSlug, courseId, curriculumId, body)
  }

  @Post(':curriculumId/duplicate')
  duplicate(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('courseId') courseId: string,
    @Param('curriculumId') curriculumId: string,
    @Body(new ZodValidationPipe(duplicateCurriculumSchema)) body: DuplicateCurriculumInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.curricula.duplicate(user.sub, orgSlug, unitSlug, courseId, curriculumId, body)
  }

  @Delete(':curriculumId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('courseId') courseId: string,
    @Param('curriculumId') curriculumId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.curricula.remove(user.sub, orgSlug, unitSlug, courseId, curriculumId)
  }
}
