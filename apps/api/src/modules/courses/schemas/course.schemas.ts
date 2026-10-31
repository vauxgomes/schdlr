import { z } from 'zod'

import { nameSchema } from '@modules/auth/schemas/auth.schemas'

// Código curto do catálogo (0011): curso, currículo e disciplina usam o mesmo formato.
export const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1)
  .max(20)
  .regex(/^[A-Z0-9]+([._-][A-Z0-9]+)*$/)

// No curso o código é opcional: vazio ou null vira null, e é assim que se apaga.
const courseCodeSchema = z
  .string()
  .nullable()
  .transform((value) => value?.trim() || null)
  .pipe(codeSchema.nullable())

// O userId de um membro da unidade, ou null para tirar o coordenador. Quem não é membro é
// regra do service (COORDINATOR_NOT_A_MEMBER), não formato.
const coordinatorIdSchema = z.string().nullable()

export const createCourseSchema = z.object({
  name: nameSchema,
  code: courseCodeSchema.default(null),
  coordinatorId: coordinatorIdSchema.default(null),
})

// Chaves extras são descartadas pelo z.object.
export const updateCourseSchema = z
  .object({
    name: nameSchema.optional(),
    code: courseCodeSchema.optional(),
    coordinatorId: coordinatorIdSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'At least one field is required',
    params: { code: 'EMPTY_UPDATE' },
  })

export type CreateCourseInput = z.infer<typeof createCourseSchema>
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>

/** PATCH só com `isActive: true`: reativa, sem o 409 de curso inativo. */
export const isCourseReactivation = (body: UpdateCourseInput) =>
  body.isActive === true &&
  body.name === undefined &&
  body.code === undefined &&
  body.coordinatorId === undefined
