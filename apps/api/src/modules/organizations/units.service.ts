import { Injectable } from '@nestjs/common'
import { Organization, Unit } from '@prisma/client'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { SubscriptionsService } from '@modules/subscriptions/subscriptions.service'

import { isUniqueViolation } from './organizations.service'
import {
  CreateTenantInput,
  isReactivation,
  UpdateTenantInput,
} from './schemas/organization.schemas'
import { TenantAccessService } from './tenant-access.service'

export type UnitView = Omit<Unit, 'organizationId'> & {
  organization: { name: string; slug: string }
  access: { isOwner: boolean; isManager: boolean; isTeacher: boolean }
}

type Role = { isManager: boolean; isTeacher: boolean }

@Injectable()
export class UnitsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenants: TenantAccessService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  /** O dono vê todas, ativas ou não; o membro, as ativas de que é membro. */
  async list(userId: string, orgSlug: string): Promise<UnitView[]> {
    const { organization, isOwner } = await this.tenants.resolveOrganization(userId, orgSlug)
    const units = await this.database.unit.findMany({
      where: {
        organizationId: organization.id,
        ...(!isOwner && { isActive: true, members: { some: { userId } } }),
      },
      include: { members: { where: { userId }, select: { isManager: true, isTeacher: true } } },
      orderBy: { name: 'asc' },
    })
    return units.map(({ members: [role], ...unit }) => toView(unit, organization, isOwner, role))
  }

  async get(userId: string, orgSlug: string, unitSlug: string): Promise<UnitView> {
    const { unit, organization, isOwner, membership } = await this.tenants.resolveUnit(
      userId,
      orgSlug,
      unitSlug,
    )
    return toView(unit, organization, isOwner, membership)
  }

  /**
   * Só o dono cria, e não vira membro: o acesso dele vem de ownerId. A organização fica travada
   * (FOR UPDATE) da contagem até o create.
   */
  async create(
    userId: string,
    orgSlug: string,
    { name, slug, address }: CreateTenantInput,
  ): Promise<UnitView> {
    const access = await this.tenants.resolveOrganization(userId, orgSlug)
    if (!access.isOwner) throw new AppException('NOT_ALLOWED')
    await this.tenants.assertWritable(access)

    const { organization } = access
    // assertWritable garante a assinatura do dono em vigor.
    const { unitsPerOrganization: max } = (await this.subscriptions.getActivePlan(
      organization.ownerId,
    ))!.limits

    try {
      const unit = await this.database.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organization.id} FOR UPDATE`

        // Conta as desativadas também (spec 0006).
        const count = await tx.unit.count({ where: { organizationId: organization.id } })
        if (max !== null && count >= max) {
          throw new AppException('PLAN_LIMIT_REACHED', { limit: 'unitsPerOrganization', max })
        }

        const taken = await tx.unit.findUnique({
          where: { organizationId_slug: { organizationId: organization.id, slug } },
          select: { id: true },
        })
        if (taken) throw new AppException('SLUG_ALREADY_IN_USE')

        return tx.unit.create({ data: { name, slug, address, organizationId: organization.id } })
      })
      return toView(unit, organization, true, null)
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppException('SLUG_ALREADY_IN_USE')
      throw error
    }
  }

  /** Dono muda tudo; responsável, só nome e endereço. */
  async update(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    body: UpdateTenantInput,
  ): Promise<UnitView> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)
    const allowed = access.isOwner || (access.isManager && body.isActive === undefined)
    if (!allowed) throw new AppException('NOT_ALLOWED')
    await this.tenants.assertWritable(access, { reactivating: isReactivation(body) })

    const unit = await this.database.unit.update({ where: { id: access.unit.id }, data: body })
    return toView(unit, access.organization, access.isOwner, access.membership)
  }
}

function toView(
  { id, name, slug, address, isActive, createdAt, updatedAt }: Unit,
  organization: Organization,
  isOwner: boolean,
  role: Role | null | undefined,
): UnitView {
  return {
    id,
    name,
    slug,
    address,
    isActive,
    createdAt,
    updatedAt,
    organization: { name: organization.name, slug: organization.slug },
    access: {
      isOwner,
      isManager: role?.isManager ?? false,
      isTeacher: role?.isTeacher ?? false,
    },
  }
}
