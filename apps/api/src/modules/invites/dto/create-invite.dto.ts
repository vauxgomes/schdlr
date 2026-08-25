import { InviteStatus, MemberRole } from '@prisma/client'
import { z } from 'zod'

export const CreateInviteSchema = z.object({
  email: z.email().toLowerCase(),
  roles: z.array(z.enum(MemberRole)).min(1),
})

export const ListInvitesSchema = z.object({
  status: z.enum(InviteStatus).optional(),
})

export type CreateInviteInput = z.infer<typeof CreateInviteSchema>
export type ListInvitesQuery = z.infer<typeof ListInvitesSchema>
