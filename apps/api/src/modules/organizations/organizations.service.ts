import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Organization, Prisma } from '@prisma/client'
import { slugify } from '../../common/slug'
import { DatabaseService } from '../../infra/database/database.service'
import { CreateOrganizationInput } from './dto/create-organization.dto'
import { UpdateOrganizationInput } from './dto/update-organization.dto'

const UNIQUE_VIOLATION = 'P2002'

@Injectable()
export class OrganizationsService {
  constructor(private readonly db: DatabaseService) {}

  async create(userId: string, input: CreateOrganizationInput) {
    try {
      return await this.db.organization.create({
        data: { name: input.name, slug: slugify(input.name), ownerId: userId },
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        throw new ConflictException('An organization with this name already exists')
      }

      throw error
    }
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
    return this.db.organization.update({ where: { id }, data: input })
  }

  async remove(userId: string, id: string) {
    await this.assertOwnership(userId, id)

    const units = await this.db.unit.count({ where: { organizationId: id } })

    if (units > 0) {
      throw new ConflictException('Cannot delete an organization that still has units')
    }

    await this.db.organization.delete({ where: { id } })
  }

  private async assertOwnership(userId: string, id: string): Promise<Organization> {
    const organization = await this.db.organization.findUnique({ where: { id } })

    if (!organization) throw new NotFoundException('Organization not found')
    if (organization.ownerId !== userId) throw new ForbiddenException('Not your organization')

    return organization
  }
}
