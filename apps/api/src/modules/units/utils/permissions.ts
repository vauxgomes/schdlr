import { ForbiddenException } from '@nestjs/common'
import { MemberRole } from '@prisma/client'
import { currentAuditContext } from '../../../infra/audit/audit-context'
import { UnitContext } from '../unit-context'

const MEMBER = [MemberRole.ADMIN, MemberRole.MANAGER, MemberRole.COORDINATOR, MemberRole.TEACHER]
const COORDINATION = [MemberRole.ADMIN, MemberRole.MANAGER, MemberRole.COORDINATOR]
const MANAGEMENT = [MemberRole.ADMIN, MemberRole.MANAGER]

// O dono da organização passa em todos: ele responde pela unidade inteira.
// Quem não é membro ativo chega aqui com `roles` vazio e não passa em nenhum.
function assertAnyRole(context: UnitContext, allowed: MemberRole[], assertName: string) {
  if (context.isOwner) return
  if (context.roles.some((role) => allowed.includes(role))) return

  // Todo 403 de unidade sai daqui, então um ponto cobre os doze módulos. A
  // linha é mais grosseira que a de sucesso: o assert dispara antes do código
  // que conhece o verbo, então o alvo é a rota.
  const audit = currentAuditContext()

  audit?.recordDenied({ type: 'route', id: audit.route }, { assert: assertName })

  throw new ForbiddenException('Insufficient permissions for this unit')
}

export function assertMemberOrOwnership(context: UnitContext) {
  assertAnyRole(context, MEMBER, 'assertMemberOrOwnership')
}

export function assertCoordinatorOrOwnership(context: UnitContext) {
  assertAnyRole(context, COORDINATION, 'assertCoordinatorOrOwnership')
}

export function assertManagement(context: UnitContext) {
  assertAnyRole(context, MANAGEMENT, 'assertManagement')
}
