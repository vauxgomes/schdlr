import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common'
import { Validate } from '../../common/decorators/validate.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy'
import { CurrentUnit } from '../units/decorators/unit-context.decorator'
import type { UnitContext } from '../units/unit-context'
import { CreateInviteSchema, ListInvitesSchema } from './dto/create-invite.dto'
import type { CreateInviteInput, ListInvitesQuery } from './dto/create-invite.dto'
import { InvitesService } from './invites.service'

@Controller('units/:unitId/invites')
export class UnitInvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Post()
  @Validate(CreateInviteSchema)
  create(
    @CurrentUnit() context: UnitContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateInviteInput,
  ) {
    return this.invitesService.create(context, user.userId, input)
  }

  @Get()
  list(
    @CurrentUnit() context: UnitContext,
    @Query(new ZodValidationPipe(ListInvitesSchema, 'query')) query: ListInvitesQuery,
  ) {
    return this.invitesService.list(context, query)
  }

  @Post(':inviteId/revoke')
  revoke(
    @CurrentUnit() context: UnitContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('inviteId') inviteId: string,
  ) {
    return this.invitesService.revoke(context, user.userId, inviteId)
  }

  @Post(':inviteId/resend')
  resend(
    @CurrentUnit() context: UnitContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('inviteId') inviteId: string,
  ) {
    return this.invitesService.resend(context, user.userId, inviteId)
  }
}

// Fora de /units/:unitId de propósito: o convidado ainda não é membro, e não
// haveria contexto de unidade para o guard resolver.
@Controller('invites')
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Get(':token')
  preview(@Param('token') token: string) {
    return this.invitesService.preview(token)
  }

  @Post(':token/accept')
  accept(@CurrentUser() user: AuthenticatedUser, @Param('token') token: string) {
    return this.invitesService.accept(token, user.userId)
  }

  @Post(':token/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  reject(@CurrentUser() user: AuthenticatedUser, @Param('token') token: string) {
    return this.invitesService.reject(token, user.userId)
  }
}
