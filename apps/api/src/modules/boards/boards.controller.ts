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

import { BoardsService } from './boards.service'
import {
  createBoardSchema,
  updateBoardSchema,
  type CreateBoardInput,
  type UpdateBoardInput,
} from './schemas/board.schemas'

// Slugs, projectId e boardId do caminho são validados pelos services: fora do formato dá 404.
@Controller('organizations/:orgSlug/units/:unitSlug/projects/:projectId/boards')
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Post()
  create(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(createBoardSchema)) body: CreateBoardInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.boards.create(user.sub, orgSlug, unitSlug, projectId, body)
  }

  @Get()
  list(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.boards.list(user.sub, orgSlug, unitSlug, projectId)
  }

  @Get(':boardId')
  get(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.boards.get(user.sub, orgSlug, unitSlug, projectId, boardId)
  }

  @Patch(':boardId')
  update(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Body(new ZodValidationPipe(updateBoardSchema)) body: UpdateBoardInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.boards.update(user.sub, orgSlug, unitSlug, projectId, boardId, body)
  }

  @Delete(':boardId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.boards.remove(user.sub, orgSlug, unitSlug, projectId, boardId)
  }
}
