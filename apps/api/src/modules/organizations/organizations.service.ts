import { Injectable } from '@nestjs/common'
import { Organization, PlanType, Prisma } from '@prisma/client'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { isUniqueViolation } from '@infra/database/prisma-errors'
import { PlanExpiredException } from '@modules/subscriptions/plan-expired.exception'
import { toActivePlan } from '@modules/subscriptions/subscriptions.service'
import { TenantAccessService } from '@modules/tenancy/tenant-access.service'

import {
  CreateOrganizationInput,
  isOrganizationReactivation,
  UpdateOrganizationInput,
} from './schemas/organization.schemas'

export type OrganizationView = Omit<Organization, 'ownerId'> & {
  owner: { id: string; email: string; name: string }
  access: { isOwner: boolean }
}

const withOwner = {
  owner: { select: { id: true, email: true, name: true } },
} satisfies Prisma.OrganizationInclude

type OrganizationWithOwner = Prisma.OrganizationGetPayload<{ include: typeof withOwner }>

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenants: TenantAccessService,
  ) {}

  /** As de que é dono (ativas ou não) e as ativas em que é membro de alguma unidade ativa. */
  async list(userId: string): Promise<OrganizationView[]> {
    const organizations = await this.database.organization.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { isActive: true, units: { some: { isActive: true, members: { some: { userId } } } } },
        ],
      },
      include: withOwner,
      orderBy: { name: 'asc' },
    })
    return organizations.map((organization) => toView(organization, userId))
  }

  async get(userId: string, orgSlug: string): Promise<OrganizationView> {
    const { organization } = await this.tenants.resolveOrganization(userId, orgSlug)
    return this.view(organization.id, userId)
  }

  /**
   * A assinatura do dono fica travada (FOR UPDATE) da contagem até o create: duas criações
   * simultâneas não passam do limite.
   */
  async create(
    userId: string,
    { name, slug, address }: CreateOrganizationInput,
  ): Promise<OrganizationView> {
    try {
      const created = await this.database.$transaction(async (tx) => {
        const [subscription] = await tx.$queryRaw<{ plan: PlanType; expiresAt: Date | null }[]>`
          SELECT plan, expires_at AS "expiresAt" FROM subscriptions
          WHERE user_id = ${userId} FOR UPDATE`
        if (!subscription) throw new AppException('SUBSCRIPTION_REQUIRED')

        const { status, limits } = toActivePlan(subscription)
        if (status !== 'ACTIVE') throw new PlanExpiredException()

        // Conta as desativadas também (spec 0006).
        const owned = await tx.organization.count({ where: { ownerId: userId } })
        if (limits.organizations !== null && owned >= limits.organizations) {
          throw new AppException('PLAN_LIMIT_REACHED', {
            limit: 'organizations',
            max: limits.organizations,
          })
        }

        if (await tx.organization.findUnique({ where: { slug }, select: { id: true } })) {
          throw new AppException('SLUG_ALREADY_IN_USE')
        }

        return tx.organization.create({
          data: { name, slug, address, ownerId: userId },
          include: withOwner,
        })
      })
      return toView(created, userId)
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppException('SLUG_ALREADY_IN_USE')
      throw error
    }
  }

  /** Só o dono. Reativar dispensa o 409 de "inativa", mas não o plano. */
  async update(
    userId: string,
    orgSlug: string,
    body: UpdateOrganizationInput,
  ): Promise<OrganizationView> {
    const access = await this.tenants.resolveOrganization(userId, orgSlug)
    if (!access.isOwner) throw new AppException('NOT_ALLOWED')
    await this.tenants.assertWritable(access, { reactivating: isOrganizationReactivation(body) })

    const updated = await this.database.organization.update({
      where: { id: access.organization.id },
      data: body,
      include: withOwner,
    })
    return toView(updated, userId)
  }

  private async view(id: string, userId: string): Promise<OrganizationView> {
    const organization = await this.database.organization.findUniqueOrThrow({
      where: { id },
      include: withOwner,
    })
    return toView(organization, userId)
  }
}

function toView(
  { ownerId, ...organization }: OrganizationWithOwner,
  userId: string,
): OrganizationView {
  return { ...organization, access: { isOwner: ownerId === userId } }
}
