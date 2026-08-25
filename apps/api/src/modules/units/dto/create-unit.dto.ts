import { z } from 'zod'

export const CreateUnitSchema = z.object({
  name: z.string().trim().min(2).max(120),
  workingDays: z.coerce.number().int().min(1).max(7).optional(),
})

export type CreateUnitInput = z.infer<typeof CreateUnitSchema>
