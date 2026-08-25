import { z } from 'zod'

export const CreateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
})

export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>
