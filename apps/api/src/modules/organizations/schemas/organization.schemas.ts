import { z } from 'zod'

import { nameSchema } from '@modules/auth/schemas/auth.schemas'

// Formato da 0002. Também valida os :orgSlug/:unitSlug do caminho (TenantAccessService).
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)

// Vazio vira null: é assim que se apaga o endereço.
export const addressSchema = z
  .string()
  .trim()
  .max(300)
  .transform((value) => value || null)

// Organização e unidade têm os mesmos campos.
export const createTenantSchema = z.object({
  name: nameSchema,
  slug: slugSchema,
  address: addressSchema.optional(),
})

// O slug não muda (as URLs ficam estáveis); chaves extras são descartadas pelo z.object.
export const updateTenantSchema = z
  .object({
    name: nameSchema.optional(),
    address: addressSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'At least one field is required',
    params: { code: 'EMPTY_UPDATE' },
  })

export type CreateTenantInput = z.infer<typeof createTenantSchema>
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>

/** PATCH só com `isActive: true`: reativa, sem o 409 da própria entidade. */
export const isReactivation = (body: UpdateTenantInput) =>
  body.isActive === true && body.name === undefined && body.address === undefined
