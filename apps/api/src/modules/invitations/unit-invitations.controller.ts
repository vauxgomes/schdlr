import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common'

import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe'
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator'
import type { JwtPayload } from '@modules/auth/jwt-payload'

import { InvitationsService } from './invitations.service'
import {
  createInvitationSchema,
  listInvitationsQuerySchema,
  type CreateInvitationInput,
  type ListInvitationsQuery,
} from './schemas/invitation.schemas'

/** Convites de uma unidade, para o dono e o responsável. */
@Controller('organizations/:orgSlug/units/:unitSlug/invitations')
export class UnitInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  list(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Query(new ZodValidationPipe(listInvitationsQuerySchema)) query: ListInvitationsQuery,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.invitations.listForUnit(user.sub, orgSlug, unitSlug, query)
  }

  @Post()
  invite(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Body(new ZodValidationPipe(createInvitationSchema)) body: CreateInvitationInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.invitations.invite(user.sub, orgSlug, unitSlug, body)
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('orgSlug') orgSlug: string,
    @Param('unitSlug') unitSlug: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.invitations.cancel(user.sub, orgSlug, unitSlug, id)
  }
}
