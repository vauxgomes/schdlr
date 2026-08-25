export const UnitMemberEvent = {
  Activated: 'unit-member.activated',
  Deactivated: 'unit-member.deactivated',
} as const

export type UnitMemberStatusPayload = {
  userId: string
  unitId: string
  memberId: string
}
