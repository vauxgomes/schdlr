import { z } from 'zod'

// Padrão da spec 0012, mais `withSlots`: a tela que desenha o quadro precisa
// da grade e das faixas de uma vez, e duas viagens só para isso não se pagam.
export const ListTimetablesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value !== 'false'),
})

export const SelectTimetablesSchema = z.object({
  withSlots: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
})

export type ListTimetablesQuery = z.infer<typeof ListTimetablesSchema>
export type SelectTimetablesQuery = z.infer<typeof SelectTimetablesSchema>
