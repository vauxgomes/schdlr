import { z } from 'zod'
import { CreateDisciplineSchema } from './create-discipline.dto'

export const UpdateDisciplineSchema = CreateDisciplineSchema.extend({
  isActive: z.boolean(),
}).partial()

export type UpdateDisciplineInput = z.infer<typeof UpdateDisciplineSchema>
