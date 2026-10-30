import { z } from 'zod'

import { nameSchema } from '@modules/auth/schemas/auth.schemas'
import { slugSchema } from '@modules/tenancy/schemas/tenancy.schemas'

// Vazio vira null: é assim que se apaga o endereço. A unidade usa o mesmo.
export const addressSchema = z
  .string()
  .trim()
  .max(300)
  .transform((value) => value || null)

export const createOrganizationSchema = z.object({
  name: nameSchema,
  slug: slugSchema,
  address: addressSchema.optional(),
})

// O slug não muda (as URLs ficam estáveis); chaves extras são descartadas pelo z.object.
export const updateOrganizationSchema = z
  .object({
    name: nameSchema.optional(),
    address: addressSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'At least one field is required',
    params: { code: 'EMPTY_UPDATE' },
  })

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>

/** PATCH só com `isActive: true`: reativa, sem o 409 de organização inativa. */
export const isOrganizationReactivation = (body: UpdateOrganizationInput) =>
  body.isActive === true && body.name === undefined && body.address === undefined
