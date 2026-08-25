import { MemberRole } from '@prisma/client'

// O que o UnitMemberGuard injeta no request e os onze módulos seguintes
// consomem. `roles` vem vazio para quem não é membro ativo; `isOwner` cobre o
// dono da organização, que tem acesso mesmo sem papel de unidade.
export type UnitContext = {
  unitId: string
  organizationId: string
  memberId: string | null
  roles: MemberRole[]
  isOwner: boolean
}

export const UNIT_CONTEXT = 'unitContext'
