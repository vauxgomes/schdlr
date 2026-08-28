import { TermStatus } from '@prisma/client'
import { z } from 'zod'

export const UpdateTermStatusSchema = z.object({
  status: z.enum(TermStatus),
})

export type UpdateTermStatusInput = z.infer<typeof UpdateTermStatusSchema>
