import { InvitationStatus } from '@prisma/client'
import { z } from 'zod'

import { emailSchema, nameSchema } from '@modules/auth/schemas/auth.schemas'

export const createInvitationSchema = z.object({
  email: emailSchema,
  // Só vale para quem ainda não tem conta; sem ele, a parte antes do @.
  name: nameSchema.optional(),
  isManager: z.boolean().default(false),
  isTeacher: z.boolean().default(false),
})

// EXPIRED filtra os vencidos calculados na leitura; PENDING, os pendentes ainda válidos.
export const listInvitationsQuerySchema = z.object({
  status: z.enum(InvitationStatus).optional(),
})

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>
export type ListInvitationsQuery = z.infer<typeof listInvitationsQuerySchema>
