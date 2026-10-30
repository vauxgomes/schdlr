import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common'

import { CurrentUser } from '@modules/auth/decorators/current-user.decorator'
import { Public } from '@modules/auth/decorators/public.decorator'
import type { JwtPayload } from '@modules/auth/jwt-payload'

import { InvitationsService } from './invitations.service'

/** Convites de quem foi convidado: logado pelo id, ou pelo link do e-mail (público). */
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  listMine(@CurrentUser() user: JwtPayload) {
    return this.invitations.listMine(user.sub)
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  accept(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.invitations.respondById(user.sub, id, 'accept')
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  reject(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.invitations.respondById(user.sub, id, 'reject')
  }

  // Quem tem o token recebeu o e-mail.
  @Public()
  @Get('by-token/:token')
  findByToken(@Param('token') token: string) {
    return this.invitations.findByToken(token)
  }

  @Public()
  @Post('by-token/:token/accept')
  @HttpCode(HttpStatus.OK)
  acceptByToken(@Param('token') token: string) {
    return this.invitations.respondByToken(token, 'accept')
  }

  @Public()
  @Post('by-token/:token/reject')
  @HttpCode(HttpStatus.OK)
  rejectByToken(@Param('token') token: string) {
    return this.invitations.respondByToken(token, 'reject')
  }
}
