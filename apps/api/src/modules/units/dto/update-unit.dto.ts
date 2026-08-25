import { z } from 'zod'

export const UpdateUnitSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    workingDays: z.coerce.number().int().min(1).max(7),
    isActive: z.boolean(),
  })
  .partial()

export type UpdateUnitInput = z.infer<typeof UpdateUnitSchema>
