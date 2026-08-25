import { Body, Controller, Get, Patch, Query } from '@nestjs/common'
import { Validate } from '../../common/decorators/validate.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy'
import { ListNotificationsSchema } from './dto/list-notifications.dto'
import { MarkReadSchema } from './dto/mark-read.dto'
import type { ListNotificationsQuery } from './dto/list-notifications.dto'
import type { MarkReadInput } from './dto/mark-read.dto'
import { NotificationsService } from './notifications.service'

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.unreadCount(user.userId)
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ListNotificationsSchema, 'query')) query: ListNotificationsQuery,
  ) {
    return this.notificationsService.list(user.userId, query)
  }

  @Patch('read')
  @Validate(MarkReadSchema)
  markRead(@CurrentUser() user: AuthenticatedUser, @Body() input: MarkReadInput) {
    return this.notificationsService.markRead(user.userId, input.ids)
  }
}
