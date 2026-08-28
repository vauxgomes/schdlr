import { z } from 'zod'

// Período não tem `isActive` — quem diz em que fase ele está é o `status`, e
// filtrar por ele não está no escopo desta spec. Só paginação, então.
export const ListTermsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type ListTermsQuery = z.infer<typeof ListTermsSchema>
