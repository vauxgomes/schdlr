import { z } from 'zod'

import { nameSchema } from '@modules/auth/schemas/auth.schemas'
import { codeSchema } from '@modules/courses/schemas/course.schemas'

// Vazia ou null vira null: é assim que se apaga a descrição.
const descriptionSchema = z
  .string()
  .trim()
  .max(1000)
  .nullable()
  .transform((value) => value || null)

// O código é obrigatório e único no curso (0002).
export const createCurriculumSchema = z.object({
  name: nameSchema,
  code: codeSchema,
  description: descriptionSchema.default(null),
})

// Chaves extras são descartadas pelo z.object.
export const updateCurriculumSchema = z
  .object({
    name: nameSchema.optional(),
    code: codeSchema.optional(),
    description: descriptionSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'At least one field is required',
    params: { code: 'EMPTY_UPDATE' },
  })

export type CreateCurriculumInput = z.infer<typeof createCurriculumSchema>
export type UpdateCurriculumInput = z.infer<typeof updateCurriculumSchema>

/** PATCH só com `isActive: true`: reativa, sem o 409 de currículo inativo. */
export const isCurriculumReactivation = (body: UpdateCurriculumInput) =>
  body.isActive === true &&
  body.name === undefined &&
  body.code === undefined &&
  body.description === undefined
