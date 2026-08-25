import { z } from 'zod'

export const UpdateProfileSchema = z.object({
  name: z.string().trim().min(2).max(120),
})

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>
