import { ForbiddenException } from '@nestjs/common'
import { MemberRole } from '@prisma/client'
import { UnitContext } from '../unit-context'

const MEMBER = [MemberRole.ADMIN, MemberRole.MANAGER, MemberRole.COORDINATOR, MemberRole.TEACHER]
const COORDINATION = [MemberRole.ADMIN, MemberRole.MANAGER, MemberRole.COORDINATOR]
const MANAGEMENT = [MemberRole.ADMIN, MemberRole.MANAGER]

// O dono da organização passa em todos: ele responde pela unidade inteira.
// Quem não é membro ativo chega aqui com `roles` vazio e não passa em nenhum.
function assertAnyRole(context: UnitContext, allowed: MemberRole[]) {
  if (context.isOwner) return
  if (context.roles.some((role) => allowed.includes(role))) return

  throw new ForbiddenException('Insufficient permissions for this unit')
}

export function assertMemberOrOwnership(context: UnitContext) {
  assertAnyRole(context, MEMBER)
}

export function assertCoordinatorOrOwnership(context: UnitContext) {
  assertAnyRole(context, COORDINATION)
}

export function assertManagement(context: UnitContext) {
  assertAnyRole(context, MANAGEMENT)
}
