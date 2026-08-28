import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Term, TermStatus } from '@prisma/client'
import { withUniqueConflict } from '../../common/unique-violation'
import { AuditAction } from '../../infra/audit/audit-actions'
import { AuditService } from '../../infra/audit/audit.service'
import { DatabaseService } from '../../infra/database/database.service'
import { UnitContext } from '../units/unit-context'
import { assertManagement, assertMemberOrOwnership } from '../units/utils/permissions'
import { CreateTermInput } from './dto/create-term.dto'
import { ListTermsQuery } from './dto/list-terms.dto'
import { UpdateTermInput } from './dto/update-term.dto'
import { canTransition } from './utils/term-status'

const NAME_TAKEN = 'A term with this name already exists in this unit'

@Injectable()
export class TermsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  // Períodos podem se sobrepor no tempo — regular e intensivo convivem — então
  // não há nada a validar entre um período e os outros.
  async create(context: UnitContext, input: CreateTermInput) {
    assertManagement(context)

    const term = await withUniqueConflict(NAME_TAKEN, () =>
      this.db.term.create({ data: { unitId: context.unitId, ...input } }),
    )

    this.audit.record(AuditAction.TermCreated, { type: 'term', id: term.id }, { ...input })

    return term
  }

  async list(context: UnitContext, query: ListTermsQuery) {
    assertMemberOrOwnership(context)

    const where = { unitId: context.unitId }

    const [items, total] = await this.db.$transaction([
      this.db.term.findMany({
        where,
        orderBy: { startDate: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.term.count({ where }),
    ])

    return { items, total, page: query.page, limit: query.limit }
  }

  // O status vem junto: quem escolhe um período precisa saber se ele ainda
  // aceita trabalho, e essa é a informação que separa um item do outro.
  select(context: UnitContext) {
    assertMemberOrOwnership(context)

    return this.db.term.findMany({
      where: { unitId: context.unitId },
      select: { id: true, name: true, status: true },
      orderBy: { startDate: 'desc' },
    })
  }

  findOne(context: UnitContext, termId: string) {
    assertMemberOrOwnership(context)

    return this.findInUnit(context, termId)
  }

  async update(context: UnitContext, termId: string, input: UpdateTermInput) {
    assertManagement(context)

    const current = await this.findInUnit(context, termId)

    // O schema de criação garante a ordem das datas no corpo inteiro; num
    // PATCH parcial, quem garante é a comparação com o que já está gravado.
    const startDate = input.startDate ?? current.startDate
    const endDate = input.endDate ?? current.endDate

    if (endDate <= startDate) {
      throw new BadRequestException('endDate must be after startDate')
    }

    const term = await withUniqueConflict(NAME_TAKEN, () =>
      this.db.term.update({ where: { id: termId }, data: input }),
    )

    this.audit.record(AuditAction.TermUpdated, { type: 'term', id: term.id }, { ...input })

    return term
  }

  async updateStatus(context: UnitContext, termId: string, status: TermStatus) {
    assertManagement(context)

    const current = await this.findInUnit(context, termId)

    if (!canTransition(current.status, status)) {
      throw new ConflictException(`A ${current.status} term cannot become ${status}`)
    }

    const term = await this.db.term.update({ where: { id: termId }, data: { status } })

    this.audit.record(
      AuditAction.TermStatusChanged,
      { type: 'term', id: term.id },
      { from: current.status, status },
    )

    return term
  }

  async remove(context: UnitContext, termId: string) {
    assertManagement(context)

    await this.findInUnit(context, termId)

    const projects = await this.db.project.count({ where: { termId } })

    if (projects > 0) {
      throw new ConflictException('Cannot delete a term that already has projects')
    }

    await this.db.term.delete({ where: { id: termId } })

    this.audit.record(AuditAction.TermDeleted, { type: 'term', id: termId })
  }

  private async findInUnit(context: UnitContext, termId: string): Promise<Term> {
    const term = await this.db.term.findFirst({ where: { id: termId, unitId: context.unitId } })

    if (!term) throw new NotFoundException('Term not found')

    return term
  }
}
