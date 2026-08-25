import { MemberRole } from '@prisma/client'
import { z } from 'zod'

export const UpdateMemberRolesSchema = z.object({
  roles: z.array(z.enum(MemberRole)),
})

export const UpdateMemberStatusSchema = z.object({
  isActive: z.boolean(),
})

// Filtro de listagem. `active` não usa z.coerce.boolean(), que faria a string
// 'false' virar true; ausente significa "só os ativos".
export const ListMembersSchema = z.object({
  role: z.enum(MemberRole).optional(),
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value !== 'false'),
})

export type UpdateMemberRolesInput = z.infer<typeof UpdateMemberRolesSchema>
export type UpdateMemberStatusInput = z.infer<typeof UpdateMemberStatusSchema>
export type ListMembersQuery = z.infer<typeof ListMembersSchema>
