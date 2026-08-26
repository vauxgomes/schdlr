import { z } from 'zod'
import { CreateCurriculumSchema } from './create-curriculum.dto'

export const UpdateCurriculumSchema = CreateCurriculumSchema.extend({
  isActive: z.boolean(),
}).partial()

export type UpdateCurriculumInput = z.infer<typeof UpdateCurriculumSchema>
