import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Location } from '@prisma/client'
import { withUniqueConflict } from '../../common/unique-violation'
import { AuditAction } from '../../infra/audit/audit-actions'
import { AuditService } from '../../infra/audit/audit.service'
import { DatabaseService } from '../../infra/database/database.service'
import { UnitContext } from '../units/unit-context'
import { assertManagement, assertMemberOrOwnership } from '../units/utils/permissions'
import { CreateLocationInput } from './dto/create-location.dto'
import { ListLocationsQuery } from './dto/list-locations.dto'
import { UpdateLocationInput } from './dto/update-location.dto'

const NAME_TAKEN = 'A location with this name already exists in this unit'

@Injectable()
export class LocationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async create(context: UnitContext, input: CreateLocationInput) {
    assertManagement(context)

    const location = await withUniqueConflict(NAME_TAKEN, () =>
      this.db.location.create({ data: { unitId: context.unitId, ...input } }),
    )

    this.audit.record(
      AuditAction.LocationCreated,
      { type: 'location', id: location.id },
      { ...input },
    )

    return location
  }

  async list(context: UnitContext, query: ListLocationsQuery) {
    assertMemberOrOwnership(context)

    const where = { unitId: context.unitId, isActive: query.active }

    const [items, total] = await this.db.$transaction([
      this.db.location.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.location.count({ where }),
    ])

    return { items, total, page: query.page, limit: query.limit }
  }

  // O tipo vem junto: quem escolhe o local no quadro precisa dele para casar
  // com o `requiredLocationType` da disciplina.
  select(context: UnitContext) {
    assertMemberOrOwnership(context)

    return this.db.location.findMany({
      where: { unitId: context.unitId, isActive: true },
      select: { id: true, name: true, type: true, capacity: true },
      orderBy: { name: 'asc' },
    })
  }

  findOne(context: UnitContext, locationId: string) {
    assertMemberOrOwnership(context)

    return this.findInUnit(context, locationId)
  }

  async update(context: UnitContext, locationId: string, input: UpdateLocationInput) {
    assertManagement(context)

    await this.findInUnit(context, locationId)

    const location = await withUniqueConflict(NAME_TAKEN, () =>
      this.db.location.update({ where: { id: locationId }, data: input }),
    )

    this.audit.record(
      AuditAction.LocationUpdated,
      { type: 'location', id: location.id },
      { ...input },
    )

    return location
  }

  // A FK do BoardSlot é `onDelete: Restrict`, então o banco já barra. Conferir
  // antes troca o erro de driver por um 409 que diz o que aconteceu.
  async remove(context: UnitContext, locationId: string) {
    assertManagement(context)

    await this.findInUnit(context, locationId)

    const slots = await this.db.boardSlot.count({ where: { locationId } })

    if (slots > 0) {
      throw new ConflictException('Cannot delete a location that is used in a schedule')
    }

    await this.db.location.delete({ where: { id: locationId } })

    this.audit.record(AuditAction.LocationDeleted, { type: 'location', id: locationId })
  }

  private async findInUnit(context: UnitContext, locationId: string): Promise<Location> {
    const location = await this.db.location.findFirst({
      where: { id: locationId, unitId: context.unitId },
    })

    if (!location) throw new NotFoundException('Location not found')

    return location
  }
}
