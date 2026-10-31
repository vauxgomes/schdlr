import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { isForeignKeyViolation, isUniqueViolation } from '@infra/database/prisma-errors'
import { TenantAccessService, UnitAccess } from '@modules/tenancy/tenant-access.service'

import {
  CreateLocationInput,
  isLocationReactivation,
  ListLocationsQuery,
  UpdateLocationInput,
} from './schemas/location.schemas'

export type LocationView = {
  id: string
  name: string
  type: string
  capacity: number | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  inUse: boolean
  access: { canManage: boolean }
}

const withBoardSlots = {
  _count: { select: { boardSlots: true } },
} satisfies Prisma.LocationInclude

type LocationWithBoardSlots = Prisma.LocationGetPayload<{ include: typeof withBoardSlots }>

/** Dono e responsável gerenciam; todo membro da unidade lê, inclusive os desativados. */
const canManage = (access: UnitAccess) => access.isOwner || access.isManager

/**
 * Locais da unidade (spec 0015): recurso compartilhado entre os cursos, não do catálogo de um
 * curso.
 */
@Injectable()
export class LocationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenants: TenantAccessService,
  ) {}

  async list(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    { type }: ListLocationsQuery,
  ): Promise<LocationView[]> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)
    const locations = await this.database.location.findMany({
      where: { unitId: access.unit.id, ...(type && { type }) },
      include: withBoardSlots,
      orderBy: { name: 'asc' },
    })
    return locations.map((location) => toView(location, access))
  }

  async get(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    locationId: string,
  ): Promise<LocationView> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)
    return toView(await this.findLocation(access, locationId), access)
  }

  async create(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    body: CreateLocationInput,
  ): Promise<LocationView> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)
    if (!canManage(access)) throw new AppException('NOT_ALLOWED')
    await this.tenants.assertWritable(access)
    await this.assertNameFree(access.unit.id, body.name)

    try {
      const location = await this.database.location.create({
        data: { ...body, unitId: access.unit.id },
        include: withBoardSlots,
      })
      return toView(location, access)
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppException('LOCATION_NAME_IN_USE')
      throw error
    }
  }

  async update(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    locationId: string,
    body: UpdateLocationInput,
  ): Promise<LocationView> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)
    const location = await this.findLocation(access, locationId)
    if (!canManage(access)) throw new AppException('NOT_ALLOWED')
    await this.tenants.assertWritable(access)
    if (!location.isActive && !isLocationReactivation(body)) {
      throw new AppException('LOCATION_INACTIVE')
    }

    if (body.name) await this.assertNameFree(access.unit.id, body.name, location.id)

    try {
      const updated = await this.database.location.update({
        where: { id: location.id },
        data: body,
        include: withBoardSlots,
      })
      return toView(updated, access)
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppException('LOCATION_NAME_IN_USE')
      throw error
    }
  }

  /** Apaga enquanto nenhuma célula o usa; desativado e sem uso também sai. */
  async remove(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    locationId: string,
  ): Promise<void> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)
    const location = await this.findLocation(access, locationId)
    if (!canManage(access)) throw new AppException('NOT_ALLOWED')
    await this.tenants.assertWritable(access)

    if (location._count.boardSlots > 0) throw new AppException('LOCATION_IN_USE')

    try {
      await this.database.location.delete({ where: { id: location.id } })
    } catch (error) {
      // Uma célula alocada entre a leitura e o delete: o Restrict de BoardSlot.locationId barra.
      if (isForeignKeyViolation(error)) throw new AppException('LOCATION_IN_USE')
      throw error
    }
  }

  /** Local de outra unidade, inexistente ou com id fora do formato: 404. */
  private async findLocation({ unit }: UnitAccess, locationId: string) {
    const location =
      z.cuid().safeParse(locationId).success &&
      (await this.database.location.findFirst({
        where: { id: locationId, unitId: unit.id },
        include: withBoardSlots,
      }))
    if (!location) throw new AppException('LOCATION_NOT_FOUND')
    return location
  }

  /** Nome único na unidade. */
  private async assertNameFree(unitId: string, name: string, locationId?: string) {
    const taken = await this.database.location.findUnique({
      where: { unitId_name: { unitId, name } },
      select: { id: true },
    })
    if (taken && taken.id !== locationId) throw new AppException('LOCATION_NAME_IN_USE')
  }
}

function toView(
  { id, name, type, capacity, isActive, createdAt, updatedAt, _count }: LocationWithBoardSlots,
  access: UnitAccess,
): LocationView {
  return {
    id,
    name,
    type,
    capacity,
    isActive,
    createdAt,
    updatedAt,
    inUse: _count.boardSlots > 0,
    access: { canManage: canManage(access) },
  }
}
