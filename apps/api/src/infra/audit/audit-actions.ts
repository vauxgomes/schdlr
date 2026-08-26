// Vocabulário fechado, no mesmo espírito dos eventos de domínio: quem lê a
// trilha com regex depende de o verbo não variar, e não há verificação entre
// quem escreve e quem consome.
export const AuditAction = {
  OrganizationCreated: 'organization.created',
  OrganizationUpdated: 'organization.updated',
  OrganizationDeleted: 'organization.deleted',
  UnitCreated: 'unit.created',
  UnitUpdated: 'unit.updated',
  UnitDeleted: 'unit.deleted',
  MemberRolesChanged: 'member.roles-changed',
  MemberActivated: 'member.activated',
  MemberDeactivated: 'member.deactivated',
  InviteCreated: 'invite.created',
  InviteRevoked: 'invite.revoked',
  InviteResent: 'invite.resent',
  InviteAccepted: 'invite.accepted',
  InviteRejected: 'invite.rejected',
  AccessDenied: 'access.denied',
} as const

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction]
