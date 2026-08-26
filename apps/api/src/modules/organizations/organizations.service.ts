import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Organization } from '@prisma/client'
import { slugify } from '../../common/slug'
import { withUniqueConflict } from '../../common/unique-violation'
import { AuditAction } from '../../infra/audit/audit-actions'
import { AuditService } from '../../infra/audit/audit.service'
import { DatabaseService } from '../../infra/database/database.service'
import { CreateOrganizationInput } from './dto/create-organization.dto'
import { UpdateOrganizationInput } from './dto/update-organization.dto'

const NAME_TAKEN = 'An organization with this name already exists'

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async create(userId: string, input: CreateOrganizationInput) {
    const organization = await withUniqueConflict(NAME_TAKEN, () =>
      this.db.organization.create({
        data: { name: input.name, slug: slugify(input.name), ownerId: userId },
      }),
    )

    this.audit.record(
      AuditAction.OrganizationCreated,
      { type: 'organization', id: organization.id },
      { name: organization.name, slug: organization.slug },
    )

    return organization
  }

  // O `where` carrega o ownerId: é ele que impede a organização do vizinho de
  // aparecer aqui, e não um filtro aplicado depois.
  list(userId: string) {
    return this.db.organization.findMany({
      where: { ownerId: userId },
      orderBy: { name: 'asc' },
    })
  }

  select(userId: string) {
    return this.db.organization.findMany({
      where: { ownerId: userId, isActive: true },
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    })
  }

  findOne(userId: string, id: string) {
    return this.assertOwnership(userId, id)
  }

  async update(userId: string, id: string, input: UpdateOrganizationInput) {
    await this.assertOwnership(userId, id)

    // O slug não acompanha a troca de nome: ele está na URL, e reescrevê-lo
    // quebraria todo link já compartilhado.
    const organization = await this.db.organization.update({ where: { id }, data: input })

    this.audit.record(AuditAction.OrganizationUpdated, { type: 'organization', id }, { ...input })

    return organization
  }

  async remove(userId: string, id: string) {
    await this.assertOwnership(userId, id)

    const units = await this.db.unit.count({ where: { organizationId: id } })

    if (units > 0) {
      throw new ConflictException('Cannot delete an organization that still has units')
    }

    await this.db.organization.delete({ where: { id } })

    this.audit.record(AuditAction.OrganizationDeleted, { type: 'organization', id })
  }

  private async assertOwnership(userId: string, id: string): Promise<Organization> {
    const organization = await this.db.organization.findUnique({ where: { id } })

    if (!organization) throw new NotFoundException('Organization not found')
    if (organization.ownerId !== userId) throw new ForbiddenException('Not your organization')

    return organization
  }
}
