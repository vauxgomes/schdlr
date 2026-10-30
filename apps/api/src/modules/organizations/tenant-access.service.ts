import { Injectable } from '@nestjs/common'
import { Organization, Unit, UnitMember } from '@prisma/client'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { PlanExpiredException } from '@modules/subscriptions/plan-expired.exception'
import { SubscriptionsService } from '@modules/subscriptions/subscriptions.service'

import { slugSchema } from './schemas/organization.schemas'

export type OrganizationAccess = {
  organization: Organization
  isOwner: boolean
}

export type UnitAccess = OrganizationAccess & {
  unit: Unit
  membership: UnitMember | null // null para o dono que não é membro
  isManager: boolean
  isTeacher: boolean
}

/** Slug fora do formato é um slug que não existe: 404, não 400. */
const parseSlug = (value: string) => {
  const result = slugSchema.safeParse(value)
  return result.success ? result.data : null
}

/**
 * Quem é o usuário numa organização ou unidade, e se ela aceita escrita (spec 0009). Quem não
 * enxerga recebe 404; o papel é lido do banco a cada requisição e quem chama decide se basta.
 */
@Injectable()
export class TenantAccessService {
  constructor(
    private readonly database: DatabaseService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  /** Enxerga: o dono, ou membro de alguma unidade ativa de uma organização ativa. */
  async resolveOrganization(userId: string, orgSlug: string): Promise<OrganizationAccess> {
    const slug = parseSlug(orgSlug)
    const organization = slug && (await this.database.organization.findUnique({ where: { slug } }))
    if (!organization) throw new AppException('ORGANIZATION_NOT_FOUND')

    if (organization.ownerId === userId) return { organization, isOwner: true }

    const member =
      organization.isActive &&
      (await this.database.unitMember.findFirst({
        where: { userId, unit: { organizationId: organization.id, isActive: true } },
        select: { id: true },
      }))
    if (!member) throw new AppException('ORGANIZATION_NOT_FOUND')
    return { organization, isOwner: false }
  }

  /** Enxerga: o dono, ou membro da unidade, se ela estiver ativa. */
  async resolveUnit(userId: string, orgSlug: string, unitSlug: string): Promise<UnitAccess> {
    const access = await this.resolveOrganization(userId, orgSlug)

    const slug = parseSlug(unitSlug)
    const unit =
      slug &&
      (await this.database.unit.findUnique({
        where: { organizationId_slug: { organizationId: access.organization.id, slug } },
      }))
    if (!unit) throw new AppException('UNIT_NOT_FOUND')

    const membership = await this.database.unitMember.findUnique({
      where: { unitId_userId: { unitId: unit.id, userId } },
    })
    if (!access.isOwner && (!unit.isActive || !membership)) {
      throw new AppException('UNIT_NOT_FOUND')
    }

    return {
      ...access,
      unit,
      membership,
      isManager: membership?.isManager ?? false,
      isTeacher: membership?.isTeacher ?? false,
    }
  }

  /**
   * Pode escrever aqui: organização e unidade ativas e o plano **do dono** em vigor. Com
   * `reactivating`, dispensa só o 409 da própria entidade (a unidade, num UnitAccess).
   */
  async assertWritable(
    access: OrganizationAccess | UnitAccess,
    { reactivating = false }: { reactivating?: boolean } = {},
  ): Promise<void> {
    const isUnit = 'unit' in access
    if (!access.organization.isActive && !(reactivating && !isUnit)) {
      throw new AppException('ORGANIZATION_INACTIVE')
    }
    if (isUnit && !access.unit.isActive && !reactivating) {
      throw new AppException('UNIT_INACTIVE')
    }

    // Dono sem assinatura conta como vencido.
    const plan = await this.subscriptions.getActivePlan(access.organization.ownerId)
    if (plan?.status !== 'ACTIVE') throw new PlanExpiredException()
  }
}
