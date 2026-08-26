import { z } from 'zod'

// Padrão da spec 0012: `active` ausente significa "só os ativos", e não usa
// z.coerce.boolean(), que faria a string 'false' virar true.
export const ListLocationsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value !== 'false'),
})

export type ListLocationsQuery = z.infer<typeof ListLocationsSchema>
