import { NotificationType } from '@prisma/client'

// Nomeado pelo fato de domínio, não pelo canal: a 0011 vai pendurar o ouvinte
// de notificação aqui, e a 0010 provavelmente outro. Quem emite não sabe nem
// quer saber quantos escutam.
export const MemberEvent = {
  ActiveChanged: 'unit-member.active-changed',
} as const

export type MemberActiveChangedPayload = {
  userId: string
  unitId: string
  memberId: string
  type: typeof NotificationType.MEMBER_ACTIVATED | typeof NotificationType.MEMBER_DEACTIVATED
}
