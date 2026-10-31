import { Injectable } from '@nestjs/common'
import { Prisma, TermStatus } from '@prisma/client'

import { AppException } from '@common/errors/app.exception'
import { DatabaseService } from '@infra/database/database.service'
import { isForeignKeyViolation, isUniqueViolation } from '@infra/database/prisma-errors'
import { TenantAccessService, UnitAccess } from '@modules/tenancy/tenant-access.service'

import {
  ChangeTermStatusInput,
  CreateTermInput,
  END_BEFORE_START,
  ListTermsQuery,
  UpdateTermInput,
} from './schemas/term.schemas'
import { TermAccess, TermAccessService } from './term-access.service'
import { canTransition, TERM_TRANSITIONS } from './term-policy'

export type TermView = {
  id: string
  name: string
  startDate: string
  endDate: string
  status: TermStatus
  nextStatuses: readonly TermStatus[]
  createdAt: Date
  updatedAt: Date
  createdBy: { id: string; email: string; name: string }
  projectsCount: number
  access: { canManageTerm: boolean }
}

const withDetails = {
  createdBy: { select: { id: true, email: true, name: true } },
  _count: { select: { projects: true } },
} satisfies Prisma.TermInclude

type TermWithDetails = Prisma.TermGetPayload<{ include: typeof withDetails }>

/** Dono e responsável gerenciam o semestre; todo membro da unidade lê, em qualquer status. */
const canManageTerm = (access: UnitAccess) => access.isOwner || access.isManager

/** O @db.Date chega à meia-noite UTC; a data sai e entra como YYYY-MM-DD, sem fuso. */
const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`)
const fromDate = (value: Date) => value.toISOString().slice(0, 10)

/** Semestres da unidade e o ciclo de status deles (spec 0016). */
@Injectable()
export class TermsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenants: TenantAccessService,
    private readonly terms: TermAccessService,
  ) {}

  /** Mais recentes primeiro. */
  async list(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    { status }: ListTermsQuery,
  ): Promise<TermView[]> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)
    const terms = await this.database.term.findMany({
      where: { unitId: access.unit.id, ...(status && { status }) },
      include: withDetails,
      orderBy: [{ startDate: 'desc' }, { name: 'asc' }],
    })
    return terms.map((term) => toView(term, access))
  }

  async get(userId: string, orgSlug: string, unitSlug: string, termId: string): Promise<TermView> {
    const access = await this.terms.resolveTerm(userId, orgSlug, unitSlug, termId)
    return this.view(access.term.id, access)
  }

  /** Nasce em PLANNING, criado por quem chamou. */
  async create(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    { name, startDate, endDate }: CreateTermInput,
  ): Promise<TermView> {
    const access = await this.tenants.resolveUnit(userId, orgSlug, unitSlug)
    if (!canManageTerm(access)) throw new AppException('NOT_ALLOWED')
    await this.tenants.assertWritable(access)
    await this.assertNameFree(access.unit.id, name)

    try {
      const term = await this.database.term.create({
        data: {
          name,
          startDate: toDate(startDate),
          endDate: toDate(endDate),
          unitId: access.unit.id,
          createdById: userId,
        },
        include: withDetails,
      })
      return toView(term, access)
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppException('TERM_NAME_IN_USE')
      throw error
    }
  }

  /** Nome e datas; a regra das datas vale para o resultado (a nova contra a que fica). */
  async update(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    termId: string,
    { name, startDate, endDate }: UpdateTermInput,
  ): Promise<TermView> {
    const access = await this.terms.resolveTerm(userId, orgSlug, unitSlug, termId)
    if (!access.canManageTerm) throw new AppException('NOT_ALLOWED')
    await this.terms.assertTermWritable(access)

    const { term } = access
    const start = startDate ?? fromDate(term.startDate)
    const end = endDate ?? fromDate(term.endDate)
    if (end < start) {
      throw new AppException('VALIDATION_FAILED', undefined, [{ ...END_BEFORE_START }])
    }
    if (name) await this.assertNameFree(access.unit.id, name, term.id)

    try {
      await this.database.term.update({
        where: { id: term.id },
        data: {
          name,
          ...(startDate && { startDate: toDate(startDate) }),
          ...(endDate && { endDate: toDate(endDate) }),
        },
      })
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppException('TERM_NAME_IN_USE')
      throw error
    }
    return this.view(term.id, access)
  }

  /** Só as transições de TERM_TRANSITIONS; não mexe nos projetos. */
  async changeStatus(
    userId: string,
    orgSlug: string,
    unitSlug: string,
    termId: string,
    { status }: ChangeTermStatusInput,
  ): Promise<TermView> {
    const access = await this.terms.resolveTerm(userId, orgSlug, unitSlug, termId)
    if (!access.canManageTerm) throw new AppException('NOT_ALLOWED')
    await this.tenants.assertWritable(access)

    const from = access.term.status
    if (!canTransition(from, status)) {
      throw new AppException('INVALID_TERM_TRANSITION', { from, to: status })
    }

    await this.database.term.update({ where: { id: access.term.id }, data: { status } })
    return this.view(access.term.id, access)
  }

  /**
   * Apaga enquanto não tem projeto, em qualquer status: um semestre cancelado e vazio também sai.
   * Term não tem isActive.
   */
  async remove(userId: string, orgSlug: string, unitSlug: string, termId: string): Promise<void> {
    const access = await this.terms.resolveTerm(userId, orgSlug, unitSlug, termId)
    if (!access.canManageTerm) throw new AppException('NOT_ALLOWED')
    await this.tenants.assertWritable(access)

    const { id } = access.term
    const projects = await this.database.project.count({ where: { termId: id } })
    if (projects > 0) throw new AppException('TERM_IN_USE')

    try {
      await this.database.term.delete({ where: { id } })
    } catch (error) {
      // Um projeto criado entre a contagem e o delete: o Restrict de Project.termId barra.
      if (isForeignKeyViolation(error)) throw new AppException('TERM_IN_USE')
      throw error
    }
  }

  private async view(termId: string, access: TermAccess): Promise<TermView> {
    const term = await this.database.term.findUniqueOrThrow({
      where: { id: termId },
      include: withDetails,
    })
    return toView(term, access)
  }

  /** Nome único na unidade. */
  private async assertNameFree(unitId: string, name: string, termId?: string) {
    const taken = await this.database.term.findUnique({
      where: { unitId_name: { unitId, name } },
      select: { id: true },
    })
    if (taken && taken.id !== termId) throw new AppException('TERM_NAME_IN_USE')
  }
}

function toView(
  {
    id,
    name,
    startDate,
    endDate,
    status,
    createdAt,
    updatedAt,
    createdBy,
    _count,
  }: TermWithDetails,
  access: UnitAccess,
): TermView {
  return {
    id,
    name,
    startDate: fromDate(startDate),
    endDate: fromDate(endDate),
    status,
    nextStatuses: TERM_TRANSITIONS[status],
    createdAt,
    updatedAt,
    createdBy,
    projectsCount: _count.projects,
    access: { canManageTerm: canManageTerm(access) },
  }
}
