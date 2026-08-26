import { LocationType } from '@prisma/client'
import { z } from 'zod'

export const CreateLocationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(LocationType),
  // Informativa por enquanto: nada valida turma contra capacidade. Zero ou
  // negativo é erro de digitação, não "sem capacidade" — para isso, ausente.
  capacity: z.coerce.number().int().positive().nullish(),
})

export type CreateLocationInput = z.infer<typeof CreateLocationSchema>
