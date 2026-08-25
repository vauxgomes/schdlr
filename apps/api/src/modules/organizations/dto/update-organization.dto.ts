import { z } from 'zod'

export const UpdateOrganizationSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    isActive: z.boolean(),
  })
  .partial()

export type UpdateOrganizationInput = z.infer<typeof UpdateOrganizationSchema>
