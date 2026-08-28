import { z } from 'zod'

export const CreateTimetableSchema = z.object({
  name: z.string().trim().min(1).max(60),
})

export type CreateTimetableInput = z.infer<typeof CreateTimetableSchema>
