import { z } from 'zod'
import { CreateCourseSchema } from './create-course.dto'

export const UpdateCourseSchema = CreateCourseSchema.extend({
  isActive: z.boolean(),
}).partial()

export type UpdateCourseInput = z.infer<typeof UpdateCourseSchema>
