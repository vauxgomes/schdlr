import { Injectable, UnauthorizedException } from '@nestjs/common'
import { SystemRole } from '@prisma/client'

import { DatabaseService } from '@infra/database/database.service'
import { ActivePlan, SubscriptionsService } from '@modules/subscriptions/subscriptions.service'

import { UpdateProfileInput } from './schemas/profile.schemas'

export type Profile = {
  id: string
  email: string
  name: string
  systemRole: SystemRole
  emailVerifiedAt: Date | null
  createdAt: Date
  organizationsOwned: number
  subscription: ActivePlan | null
}

@Injectable()
export class ProfileService {
  constructor(
    private readonly database: DatabaseService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async get(userId: string): Promise<Profile> {
    const user = await this.database.user.findUnique({ where: { id: userId } })
    if (!user?.isActive) throw new UnauthorizedException()

    // Conta as desativadas também: é a mesma contagem do limite do plano (spec 0006).
    const [organizationsOwned, subscription] = await Promise.all([
      this.database.organization.count({ where: { ownerId: userId } }),
      this.subscriptions.getActivePlan(userId),
    ])

    const { id, email, name, systemRole, emailVerifiedAt, createdAt } = user
    return {
      id,
      email,
      name,
      systemRole,
      emailVerifiedAt,
      createdAt,
      organizationsOwned,
      subscription,
    }
  }

  async update(userId: string, { name }: UpdateProfileInput): Promise<Profile> {
    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: { isActive: true },
    })
    if (!user?.isActive) throw new UnauthorizedException()

    await this.database.user.update({ where: { id: userId }, data: { name } })
    return this.get(userId)
  }
}
