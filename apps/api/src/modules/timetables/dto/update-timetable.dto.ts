import { z } from 'zod'
import { CreateTimetableSchema } from './create-timetable.dto'

export const UpdateTimetableSchema = CreateTimetableSchema.extend({
  isActive: z.boolean(),
}).partial()

export type UpdateTimetableInput = z.infer<typeof UpdateTimetableSchema>
