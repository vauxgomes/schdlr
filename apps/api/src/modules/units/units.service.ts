import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { MemberRole, Prisma } from '@prisma/client'
import { slugify } from '../../common/slug'
import { DatabaseService } from '../../infra/database/database.service'
import { CreateUnitInput } from './dto/create-unit.dto'
import { UpdateUnitInput } from './dto/update-unit.dto'
import { UnitContext } from './unit-context'
import { assertManagement, assertMemberOrOwnership } from './utils/permissions'

const UNIQUE_VIOLATION = 'P2002'

@Injectable()
export class UnitsService {
  constructor(private readonly db: DatabaseService) {}

  // Criar e listar vivem sob a organização: a autoridade aqui é o dono, e
  // ainda não existe contexto de unidade para o guard resolver.
  async create(userId: string, organizationId: string, input: CreateUnitInput) {
    const ownerId = await this.assertOrganizationOwnership(userId, organizationId)

    try {
      return await this.db.unit.create({
        data: {
          organizationId,
          name: input.name,
          slug: slugify(input.name),
          workingDays: input.workingDays,
          // O dono nasce membro ADMIN: a 0018 exige um UnitMember para
          // registrar quem criou o projeto, e o campo não é opcional.
          members: { create: { userId: ownerId, roles: [MemberRole.ADMIN] } },
        },
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        throw new ConflictException('A unit with this name already exists in this organization')
      }

      throw error
    }
  }

  async listByOrganization(userId: string, organizationId: string) {
    await this.assertOrganizationOwnership(userId, organizationId)

    return this.db.unit.findMany({ where: { organizationId }, orderBy: { name: 'asc' } })
  }

  // As unidades que a pessoa alcança: como membro ativo, ou como dono da
  // organização. É a tela de escolha de unidade depois do login.
  select(userId: string) {
    return this.db.unit.findMany({
      where: {
        isActive: true,
        OR: [
          { members: { some: { userId, isActive: true } } },
          { organization: { ownerId: userId } },
        ],
      },
      select: { id: true, name: true, slug: true, organizationId: true },
      orderBy: { name: 'asc' },
    })
  }

  findOne(context: UnitContext) {
    assertMemberOrOwnership(context)

    return this.db.unit.findUniqueOrThrow({ where: { id: context.unitId } })
  }

  update(context: UnitContext, input: UpdateUnitInput) {
    assertManagement(context)

    return this.db.unit.update({ where: { id: context.unitId }, data: input })
  }

  async remove(context: UnitContext) {
    assertManagement(context)

    const organization = await this.db.organization.findUniqueOrThrow({
      where: { id: context.organizationId },
      select: { ownerId: true },
    })

    // O membro do próprio dono não conta: ele é criado junto com a unidade, e
    // contá-lo tornaria toda unidade indeletável desde o nascimento.
    const others = await this.db.unitMember.count({
      where: { unitId: context.unitId, isActive: true, userId: { not: organization.ownerId } },
    })

    if (others > 0) {
      throw new ConflictException('Cannot delete a unit that still has active members')
    }

    await this.db.$transaction([
      this.db.unitMember.deleteMany({ where: { unitId: context.unitId } }),
      this.db.unit.delete({ where: { id: context.unitId } }),
    ])
  }

  private async assertOrganizationOwnership(userId: string, organizationId: string) {
    const organization = await this.db.organization.findUnique({
      where: { id: organizationId },
      select: { ownerId: true },
    })

    if (!organization) throw new NotFoundException('Organization not found')
    if (organization.ownerId !== userId) throw new ForbiddenException('Not your organization')

    return organization.ownerId
  }
}
