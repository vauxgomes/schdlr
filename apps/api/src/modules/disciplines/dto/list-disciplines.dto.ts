import { z } from 'zod'

// Paginação e filtro da listagem, no padrão da spec 0012: `active` não usa
// z.coerce.boolean(), que faria a string 'false' virar true; ausente significa
// "só as ativas".
export const ListDisciplinesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value !== 'false'),
})

export type ListDisciplinesQuery = z.infer<typeof ListDisciplinesSchema>
