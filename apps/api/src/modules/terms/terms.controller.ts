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
  changeTermStatusSchema,
  createTermSchema,
  listTermsQuerySchema,
  updateTermSchema,
  type ChangeTermStatusInput,
  type CreateTermInput,
  type ListTermsQuery,
  type UpdateTermInput,
} from './schemas/term.schemas'
import { TermsService } from './terms.service'

// Slugs e termId do caminho são validados pelos services de acesso: fora do formato dá 404.
@Controller('organizations/:orgSlug/units/:unitSlug/terms')
export class TermsController {
  constructor(private readonly terms: TermsService) {}

  @Post()
  create(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Body(new ZodValidationPipe(createTermSchema)) body: CreateTermInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.terms.create(user.sub, orgSlug, unitSlug, body)
  }

  @Get()
  list(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Query(new ZodValidationPipe(listTermsQuerySchema)) query: ListTermsQuery,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.terms.list(user.sub, orgSlug, unitSlug, query)
  }

  @Get(':termId')
  get(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('termId') termId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.terms.get(user.sub, orgSlug, unitSlug, termId)
  }

  @Patch(':termId')
  update(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('termId') termId: string,
    @Body(new ZodValidationPipe(updateTermSchema)) body: UpdateTermInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.terms.update(user.sub, orgSlug, unitSlug, termId, body)
  }

  @Post(':termId/status')
  @HttpCode(HttpStatus.OK)
  changeStatus(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('termId') termId: string,
    @Body(new ZodValidationPipe(changeTermStatusSchema)) body: ChangeTermStatusInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.terms.changeStatus(user.sub, orgSlug, unitSlug, termId, body)
  }

  @Delete(':termId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('termId') termId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.terms.remove(user.sub, orgSlug, unitSlug, termId)
  }
}
