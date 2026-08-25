import { BadRequestException, Injectable } from '@nestjs/common'
import { NotificationType } from '@prisma/client'
import { DatabaseService } from '../../infra/database/database.service'
import { ListNotificationsQuery } from './dto/list-notifications.dto'
import { NotificationPayload, NotificationPayloadSchema } from './notification-payloads'

export type CreateNotification<T extends NotificationType> = {
  userId: string
  type: T
  payload: NotificationPayload<T>
  referenceId?: string
}

@Injectable()
export class NotificationsService {
  constructor(private readonly db: DatabaseService) {}

  // Serviço interno: quem chama é o listener, nunca um controller. O domínio
  // emite evento e não sabe que notificação existe.
  //
  // `async` de propósito: a validação falha antes de qualquer await, e sem isso
  // a exceção escaparia de forma síncrona — quem usasse `.catch()` em vez de
  // `await` não a pegaria.
  async create<T extends NotificationType>(input: CreateNotification<T>) {
    const result = NotificationPayloadSchema[input.type].safeParse(input.payload)

    if (!result.success) {
      throw new BadRequestException({
        message: `Invalid payload for ${input.type}`,
        issues: result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }

    return await this.db.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        payload: result.data,
        referenceId: input.referenceId,
      },
    })
  }

  // Toda leitura é escopada pelo userId do token: notificação é do usuário,
  // nunca da unidade.
  async list(userId: string, query: ListNotificationsQuery) {
    const where = { userId, ...(query.unreadOnly ? { readAt: null } : {}) }

    const [items, total] = await this.db.$transaction([
      this.db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.notification.count({ where }),
    ])

    return { items, total, page: query.page, limit: query.limit }
  }

  async unreadCount(userId: string) {
    return { count: await this.db.notification.count({ where: { userId, readAt: null } }) }
  }

  // O userId no where é o que impede marcar a notificação do vizinho: sem ele,
  // um id adivinhado bastaria.
  async markRead(userId: string, ids: string[]) {
    const { count } = await this.db.notification.updateMany({
      where: { id: { in: ids }, userId, readAt: null },
      data: { readAt: new Date() },
    })

    return { updated: count }
  }
}
