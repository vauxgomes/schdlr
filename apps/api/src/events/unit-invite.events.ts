import { MemberRole } from '@prisma/client'

export const UnitInviteEvent = {
  Created: 'unit-invite.created',
} as const

// `userId` preenchido quando o e-mail já tem conta. Quem emite não escolhe o
// canal: os dois ouvintes recebem tudo e cada um decide se aquele convite é
// com ele.
export type UnitInviteCreatedPayload = {
  inviteId: string
  unitId: string
  unitName: string
  email: string
  userId: string | null
  roles: MemberRole[]
  token: string
  expiresAt: Date
}
