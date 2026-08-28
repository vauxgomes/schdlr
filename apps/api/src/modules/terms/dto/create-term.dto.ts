import { z } from 'zod'

export const CreateTermSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((term) => term.endDate > term.startDate, {
    path: ['endDate'],
    message: 'endDate must be after startDate',
  })

export type CreateTermInput = z.infer<typeof CreateTermSchema>
