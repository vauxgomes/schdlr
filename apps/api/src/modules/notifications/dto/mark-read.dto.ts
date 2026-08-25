import { z } from 'zod'

export const MarkReadSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
})

export type MarkReadInput = z.infer<typeof MarkReadSchema>
