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

import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe'
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator'
import type { JwtPayload } from '@modules/auth/jwt-payload'

import {
  createTeacherSchema,
  listTeachersQuerySchema,
  updateTeacherSchema,
  type CreateTeacherInput,
  type ListTeachersQuery,
  type UpdateTeacherInput,
} from './schemas/teacher.schemas'
import { TeachersService } from './teachers.service'

// O slug e o teacherId do caminho são validados pelo service: fora do formato dá 404.
@Controller('organizations/:orgSlug/teachers')
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Post()
  create(
    @Param('orgSlug') orgSlug: string,
    @Body(new ZodValidationPipe(createTeacherSchema)) body: CreateTeacherInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.teachers.create(user.sub, orgSlug, body)
  }

  @Get()
  list(
    @Param('orgSlug') orgSlug: string,
    @Query(new ZodValidationPipe(listTeachersQuerySchema)) query: ListTeachersQuery,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.teachers.list(user.sub, orgSlug, query)
  }

  @Get(':teacherId')
  get(
    @Param('orgSlug') orgSlug: string,
    @Param('teacherId') teacherId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.teachers.get(user.sub, orgSlug, teacherId)
  }

  @Patch(':teacherId')
  update(
    @Param('orgSlug') orgSlug: string,
    @Param('teacherId') teacherId: string,
    @Body(new ZodValidationPipe(updateTeacherSchema)) body: UpdateTeacherInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.teachers.update(user.sub, orgSlug, teacherId, body)
  }

  @Delete(':teacherId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('orgSlug') orgSlug: string,
    @Param('teacherId') teacherId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.teachers.remove(user.sub, orgSlug, teacherId)
  }
}
