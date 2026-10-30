import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PlanType, Prisma } from '@prisma/client'

import { DatabaseService } from '@infra/database/database.service'

import { addMonths, PlanLimits, PLANS } from './plans'
import { AssignSubscriptionInput } from './schemas/subscription.schemas'

export type ActivePlan = {
  plan: PlanType
  status: 'ACTIVE' | 'EXPIRED'
  expiresAt: Date | null
  limits: PlanLimits
}

export type SubscriptionView = ActivePlan & {
  email: string
  startsAt: Date
  assignedBy: string | null
}

const withEmails = {
  user: { select: { email: true } },
  assignedBy: { select: { email: true } },
} satisfies Prisma.SubscriptionInclude

type SubscriptionWithEmails = Prisma.SubscriptionGetPayload<{ include: typeof withEmails }>

const userNotFound = () => new NotFoundException({ statusCode: 404, message: 'User not found' })
const subscriptionNotFound = () =>
  new NotFoundException({ statusCode: 404, message: 'Subscription not found' })

@Injectable()
export class SubscriptionsService {
  constructor(private readonly database: DatabaseService) {}

  /** O plano vigente do usuário, ou null sem assinatura. O status é calculado na leitura. */
  async getActivePlan(userId: string): Promise<ActivePlan | null> {
    const subscription = await this.database.subscription.findUnique({ where: { userId } })
    return subscription && toActivePlan(subscription)
  }

  async findByEmail(email: string): Promise<SubscriptionView> {
    const userId = await this.userIdByEmail(email)
    const subscription = await this.database.subscription.findUnique({
      where: { userId },
      include: withEmails,
    })
    if (!subscription) throw subscriptionNotFound()
    return toView(subscription)
  }

  /** Cria ou substitui a assinatura (é uma por usuário). */
  async assign(
    email: string,
    { plan, expiresAt }: AssignSubscriptionInput,
    actorId: string,
  ): Promise<SubscriptionView> {
    const userId = await this.userIdByEmail(email)
    const now = new Date()
    const { durationMonths } = PLANS[plan]
    const data = {
      plan,
      startsAt: now,
      expiresAt: durationMonths === null ? null : (expiresAt ?? addMonths(now, durationMonths)),
      assignedById: actorId,
    }

    const subscription = await this.database.subscription.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
      include: withEmails,
    })
    return toView(subscription)
  }

  /** +1 mês a partir da validade, ou de agora se já venceu. */
  async extend(email: string, actorId: string): Promise<SubscriptionView> {
    const userId = await this.userIdByEmail(email)
    const current = await this.database.subscription.findUnique({ where: { userId } })
    if (!current) throw subscriptionNotFound()
    if (!current.expiresAt) {
      throw new ConflictException({ statusCode: 409, message: 'Plan does not expire' })
    }

    const now = new Date()
    const from = current.expiresAt > now ? current.expiresAt : now
    const subscription = await this.database.subscription.update({
      where: { userId },
      data: { expiresAt: addMonths(from, 1), assignedById: actorId },
      include: withEmails,
    })
    return toView(subscription)
  }

  private async userIdByEmail(email: string): Promise<string> {
    const user = await this.database.user.findUnique({ where: { email }, select: { id: true } })
    if (!user) throw userNotFound()
    return user.id
  }
}

function toActivePlan({ plan, expiresAt }: { plan: PlanType; expiresAt: Date | null }): ActivePlan {
  return {
    plan,
    status: expiresAt && expiresAt <= new Date() ? 'EXPIRED' : 'ACTIVE',
    expiresAt,
    limits: PLANS[plan].limits,
  }
}

function toView(subscription: SubscriptionWithEmails): SubscriptionView {
  return {
    email: subscription.user.email,
    ...toActivePlan(subscription),
    startsAt: subscription.startsAt,
    assignedBy: subscription.assignedBy?.email ?? null,
  }
}
