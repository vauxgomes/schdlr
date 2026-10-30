import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common'

import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe'
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator'
import { RequireSystemRole } from '@modules/auth/decorators/require-system-role.decorator'
import type { JwtPayload } from '@modules/auth/jwt-payload'
import { emailSchema } from '@modules/auth/schemas/auth.schemas'

import {
  assignSubscriptionSchema,
  type AssignSubscriptionInput,
} from './schemas/subscription.schemas'
import { SubscriptionsService } from './subscriptions.service'

@RequireSystemRole('SUPPORT')
@Controller('support/subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get(':email')
  find(@Param('email', new ZodValidationPipe(emailSchema)) email: string) {
    return this.subscriptions.findByEmail(email)
  }

  @Put(':email')
  assign(
    @Param('email', new ZodValidationPipe(emailSchema)) email: string,
    @Body(new ZodValidationPipe(assignSubscriptionSchema)) body: AssignSubscriptionInput,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.subscriptions.assign(email, body, actor.sub)
  }

  @Post(':email/extend')
  @HttpCode(HttpStatus.OK)
  extend(
    @Param('email', new ZodValidationPipe(emailSchema)) email: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.subscriptions.extend(email, actor.sub)
  }
}
