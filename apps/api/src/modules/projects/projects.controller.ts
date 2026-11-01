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

import { ProjectsService } from './projects.service'
import {
  changeProjectStatusSchema,
  createProjectSchema,
  listProjectsQuerySchema,
  updateProjectSchema,
  type ChangeProjectStatusInput,
  type CreateProjectInput,
  type ListProjectsQuery,
  type UpdateProjectInput,
} from './schemas/project.schemas'

// Slugs e projectId do caminho são validados pelos services de acesso: fora do formato dá 404.
@Controller('organizations/:orgSlug/units/:unitSlug/projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  create(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Body(new ZodValidationPipe(createProjectSchema)) body: CreateProjectInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projects.create(user.sub, orgSlug, unitSlug, body)
  }

  @Get()
  list(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Query(new ZodValidationPipe(listProjectsQuerySchema)) query: ListProjectsQuery,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projects.list(user.sub, orgSlug, unitSlug, query)
  }

  @Get(':projectId')
  get(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projects.get(user.sub, orgSlug, unitSlug, projectId)
  }

  @Patch(':projectId')
  update(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) body: UpdateProjectInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projects.update(user.sub, orgSlug, unitSlug, projectId, body)
  }

  @Post(':projectId/status')
  @HttpCode(HttpStatus.OK)
  changeStatus(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(changeProjectStatusSchema)) body: ChangeProjectStatusInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projects.changeStatus(user.sub, orgSlug, unitSlug, projectId, body)
  }

  @Delete(':projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projects.remove(user.sub, orgSlug, unitSlug, projectId)
  }
}
