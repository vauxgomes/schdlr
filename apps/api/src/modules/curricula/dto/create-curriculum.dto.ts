import { z } from 'zod'

export const CreateCurriculumSchema = z.object({
  name: z.string().trim().min(2).max(120),
})

export type CreateCurriculumInput = z.infer<typeof CreateCurriculumSchema>
