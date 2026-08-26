import { z } from 'zod'

// Paginação e filtro da listagem. `active` não usa z.coerce.boolean(), que
// faria a string 'false' virar true; ausente significa "só os ativos".
export const ListCoursesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value !== 'false'),
})

export type ListCoursesQuery = z.infer<typeof ListCoursesSchema>
