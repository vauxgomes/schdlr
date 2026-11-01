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

import { OfferingsService } from './offerings.service'
import {
  listOfferingsQuerySchema,
  updateOfferingSchema,
  type ListOfferingsQuery,
  type UpdateOfferingInput,
} from './schemas/offering.schemas'

// Slugs, projectId e offeringId do caminho são validados pelos services: fora do formato dá 404.
@Controller('organizations/:orgSlug/units/:unitSlug/projects/:projectId/offerings')
export class OfferingsController {
  constructor(private readonly offerings: OfferingsService) {}

  @Get()
  list(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('projectId') projectId: string,
    @Query(new ZodValidationPipe(listOfferingsQuerySchema)) query: ListOfferingsQuery,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.offerings.list(user.sub, orgSlug, unitSlug, projectId, query)
  }

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  generate(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.offerings.generate(user.sub, orgSlug, unitSlug, projectId)
  }

  @Get(':offeringId')
  get(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('projectId') projectId: string,
    @Param('offeringId') offeringId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.offerings.get(user.sub, orgSlug, unitSlug, projectId, offeringId)
  }

  @Patch(':offeringId')
  update(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('projectId') projectId: string,
    @Param('offeringId') offeringId: string,
    @Body(new ZodValidationPipe(updateOfferingSchema)) body: UpdateOfferingInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.offerings.update(user.sub, orgSlug, unitSlug, projectId, offeringId, body)
  }

  @Delete(':offeringId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('projectId') projectId: string,
    @Param('offeringId') offeringId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.offerings.remove(user.sub, orgSlug, unitSlug, projectId, offeringId)
  }
}
