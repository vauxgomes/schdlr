import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { NotificationType } from '@prisma/client'
import { UnitInviteEvent } from '../../events/unit-invite.events'
import type { UnitInviteCreatedPayload } from '../../events/unit-invite.events'
import { UnitMemberEvent } from '../../events/unit-member.events'
import type { UnitMemberStatusPayload } from '../../events/unit-member.events'
import { DatabaseService } from '../../infra/database/database.service'
import { NotificationsService } from './notifications.service'

@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name)

  constructor(
    private readonly notifications: NotificationsService,
    private readonly db: DatabaseService,
  ) {}

  // O espelho do ouvinte de mail: só quem já tem conta recebe notificação.
  @OnEvent(UnitInviteEvent.Created)
  async handleUnitInviteCreated(payload: UnitInviteCreatedPayload) {
    if (!payload.userId) return

    try {
      await this.notifications.create({
        userId: payload.userId,
        type: NotificationType.UNIT_INVITE,
        payload: {
          unitId: payload.unitId,
          unitName: payload.unitName,
          token: payload.token,
        },
        referenceId: payload.inviteId,
      })
    } catch (error) {
      this.logger.error(`Failed to store UNIT_INVITE for user ${payload.userId}`, error)
    }
  }

  @OnEvent(UnitMemberEvent.Activated)
  handleActivated(payload: UnitMemberStatusPayload) {
    return this.notify(payload, NotificationType.MEMBER_ACTIVATED)
  }

  @OnEvent(UnitMemberEvent.Deactivated)
  handleDeactivated(payload: UnitMemberStatusPayload) {
    return this.notify(payload, NotificationType.MEMBER_DEACTIVATED)
  }

  // Mesma fronteira do mail: falha aqui não pode subir para quem emitiu, senão
  // desativar um membro passaria a responder erro por causa da notificação.
  private async notify(
    payload: UnitMemberStatusPayload,
    type: typeof NotificationType.MEMBER_ACTIVATED | typeof NotificationType.MEMBER_DEACTIVATED,
  ) {
    try {
      const unit = await this.db.unit.findUniqueOrThrow({
        where: { id: payload.unitId },
        select: { name: true },
      })

      await this.notifications.create({
        userId: payload.userId,
        type,
        payload: { unitId: payload.unitId, unitName: unit.name },
        referenceId: payload.unitId,
      })
    } catch (error) {
      this.logger.error(`Failed to store ${type} for user ${payload.userId}`, error)
    }
  }
}
