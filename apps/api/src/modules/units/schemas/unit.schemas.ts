import { z } from 'zod'

import { nameSchema } from '@modules/auth/schemas/auth.schemas'
import { addressSchema } from '@modules/organizations/schemas/organization.schemas'
import { slugSchema } from '@modules/tenancy/schemas/tenancy.schemas'

// O slug é único dentro da organização (0002).
export const createUnitSchema = z.object({
  name: nameSchema,
  slug: slugSchema,
  address: addressSchema.optional(),
})

// O slug não muda (as URLs ficam estáveis); chaves extras são descartadas pelo z.object.
export const updateUnitSchema = z
  .object({
    name: nameSchema.optional(),
    address: addressSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'At least one field is required',
    params: { code: 'EMPTY_UPDATE' },
  })

export type CreateUnitInput = z.infer<typeof createUnitSchema>
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>

/** PATCH só com `isActive: true`: reativa, sem o 409 de unidade inativa. */
export const isUnitReactivation = (body: UpdateUnitInput) =>
  body.isActive === true && body.name === undefined && body.address === undefined
