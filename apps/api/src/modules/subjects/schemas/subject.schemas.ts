import { z } from 'zod'

import { nameSchema } from '@modules/auth/schemas/auth.schemas'
import { codeSchema } from '@modules/courses/schemas/course.schemas'

// Carga horária total, em horas.
const workloadSchema = z.number().int().min(1).max(1000)

// Só agrupa e ordena as disciplinas do currículo (101, 202…) (0002).
const levelSchema = z.number().int().min(1).max(9999)

// Gravada em maiúsculas.
const colorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/)
  .toUpperCase()

// O código é obrigatório e único no currículo. Ausentes, level e color saem com o default (o
// mesmo do schema do Prisma), para a resposta e o web sempre terem os dois.
export const createSubjectSchema = z.object({
  name: nameSchema,
  code: codeSchema,
  workload: workloadSchema,
  level: levelSchema.default(1),
  color: colorSchema.default('#000000'),
})

// Chaves extras são descartadas pelo z.object.
export const updateSubjectSchema = z
  .object({
    name: nameSchema.optional(),
    code: codeSchema.optional(),
    workload: workloadSchema.optional(),
    level: levelSchema.optional(),
    color: colorSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'At least one field is required',
    params: { code: 'EMPTY_UPDATE' },
  })

export type CreateSubjectInput = z.infer<typeof createSubjectSchema>
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>

/** PATCH só com `isActive: true`: reativa, sem o 409 de disciplina inativa. */
export const isSubjectReactivation = ({ isActive, ...rest }: UpdateSubjectInput) =>
  isActive === true && Object.values(rest).every((value) => value === undefined)
