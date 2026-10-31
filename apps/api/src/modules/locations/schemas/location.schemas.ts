import { LocationType } from '@prisma/client'
import { z } from 'zod'

import { nameSchema } from '@modules/auth/schemas/auth.schemas'

// Vale para qualquer tipo, inclusive VIRTUAL (limite de participantes). null: não informada.
const capacitySchema = z.number().int().min(1).max(10000).nullable()

// O nome é único na unidade, com a comparação do banco (sensível a maiúsculas).
export const createLocationSchema = z.object({
  name: nameSchema,
  type: z.enum(LocationType),
  capacity: capacitySchema.default(null),
})

// Chaves extras são descartadas pelo z.object.
export const updateLocationSchema = z
  .object({
    name: nameSchema.optional(),
    type: z.enum(LocationType).optional(),
    capacity: capacitySchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'At least one field is required',
    params: { code: 'EMPTY_UPDATE' },
  })

export const listLocationsQuerySchema = z.object({
  type: z.enum(LocationType).optional(),
})

export type CreateLocationInput = z.infer<typeof createLocationSchema>
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>
export type ListLocationsQuery = z.infer<typeof listLocationsQuerySchema>

/** PATCH só com `isActive: true`: reativa, sem o 409 de local inativo. */
export const isLocationReactivation = ({ isActive, ...rest }: UpdateLocationInput) =>
  isActive === true && Object.values(rest).every((value) => value === undefined)
