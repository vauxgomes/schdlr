import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { MemberRole, Prisma, UnitMember } from '@prisma/client'
import { UnitMemberEvent, UnitMemberStatusPayload } from '../../events/unit-member.events'
import { AuditAction } from '../../infra/audit/audit-actions'
import { AuditService } from '../../infra/audit/audit.service'
import { DatabaseService } from '../../infra/database/database.service'
import { UnitContext } from '../units/unit-context'
import { assertManagement, assertMemberOrOwnership } from '../units/utils/permissions'
import { ListMembersQuery } from './dto/update-member.dto'

const MEMBER_LIST = {
  id: true,
  roles: true,
  isActive: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.UnitMemberSelect

@Injectable()
export class MembersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventEmitter2,
    private readonly audit: AuditService,
  ) {}

  list(context: UnitContext, query: ListMembersQuery) {
    assertManagement(context)

    return this.db.unitMember.findMany({
      where: {
        unitId: context.unitId,
        isActive: query.active,
        ...(query.role ? { roles: { has: query.role } } : {}),
      },
      select: MEMBER_LIST,
      orderBy: { user: { name: 'asc' } },
    })
  }

  // Leitura, não gestão: é daqui que sai a lista de professores para montar
  // oferta, e quem monta oferta é coordenação, não administração.
  select(context: UnitContext) {
    assertMemberOrOwnership(context)

    return this.db.unitMember.findMany({
      where: { unitId: context.unitId, isActive: true },
      select: { id: true, roles: true, user: { select: { name: true } } },
      orderBy: { user: { name: 'asc' } },
    })
  }

  async updateRoles(context: UnitContext, memberId: string, roles: MemberRole[]) {
    assertManagement(context)

    const member = await this.findInUnit(context, memberId)

    // Papel de membro desativado não significa nada: reativar primeiro deixa a
    // ordem das operações explícita, em vez de guardar papel para depois.
    if (!member.isActive) {
      throw new ConflictException('Reactivate the member before changing roles')
    }

    if (roles.length === 0) {
      throw new BadRequestException('A member needs at least one role')
    }

    if (member.id === context.memberId && !roles.includes(MemberRole.ADMIN)) {
      throw new ConflictException('You cannot drop your own ADMIN role')
    }

    const updated = await this.db.unitMember.update({
      where: { id: member.id },
      data: { roles },
      select: MEMBER_LIST,
    })

    this.audit.record(
      AuditAction.MemberRolesChanged,
      { type: 'unit_member', id: member.id },
      { roles },
    )

    return updated
  }

  async updateStatus(context: UnitContext, memberId: string, isActive: boolean) {
    assertManagement(context)

    const member = await this.findInUnit(context, memberId)

    // Sem isto, um ADMIN se desativa e a unidade pode ficar sem ninguém que
    // consiga desfazer. É conflito de estado, não falta de permissão.
    if (member.id === context.memberId && !isActive) {
      throw new ConflictException('You cannot deactivate your own membership')
    }

    const updated = await this.db.unitMember.update({
      where: { id: member.id },
      data: { isActive },
      select: MEMBER_LIST,
    })

    if (isActive !== member.isActive) {
      this.audit.record(
        isActive ? AuditAction.MemberActivated : AuditAction.MemberDeactivated,
        { type: 'unit_member', id: member.id },
        { userId: member.userId },
      )

      const payload: UnitMemberStatusPayload = {
        userId: member.userId,
        unitId: context.unitId,
        memberId: member.id,
      }

      this.events.emit(isActive ? UnitMemberEvent.Activated : UnitMemberEvent.Deactivated, payload)
    }

    return updated
  }

  private async findInUnit(context: UnitContext, memberId: string): Promise<UnitMember> {
    const member = await this.db.unitMember.findFirst({
      where: { id: memberId, unitId: context.unitId },
    })

    if (!member) throw new NotFoundException('Member not found')

    return member
  }
}
