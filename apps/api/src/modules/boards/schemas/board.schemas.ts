import { z } from 'zod'

import { nameSchema } from '@modules/auth/schemas/auth.schemas'

// Bloco que não é da unidade do projeto é 404 do service, não formato.
export const createBoardSchema = z.object({
  name: nameSchema,
  timeTableId: z.string(),
})

// Chaves extras são descartadas pelo z.object.
export const updateBoardSchema = z
  .object({
    name: nameSchema.optional(),
    timeTableId: z.string().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'At least one field is required',
    params: { code: 'EMPTY_UPDATE' },
  })

export type CreateBoardInput = z.infer<typeof createBoardSchema>
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>
