import { z } from 'zod'

import { nameSchema } from '@modules/auth/schemas/auth.schemas'

// Vazio ou null vira null: é assim que se apaga.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => value || null)

// Sem userId, é um professor a contratar. Usuário que não é membro é 400 do service, não formato.
export const createTeacherSchema = z.object({
  name: nameSchema,
  area: optionalText(120).default(null),
  notes: optionalText(1000).default(null),
  userId: z.string().optional(),
})

// O vínculo com o usuário não muda: userId não está aqui, e chaves extras são descartadas pelo
// z.object.
export const updateTeacherSchema = z
  .object({
    name: nameSchema.optional(),
    area: optionalText(120).optional(),
    notes: optionalText(1000).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'At least one field is required',
    params: { code: 'EMPTY_UPDATE' },
  })

// `stringbool`, não `coerce.boolean`: o coerce lê a string "false" como true.
export const listTeachersQuerySchema = z.object({
  q: z.string().trim().optional(),
  active: z.stringbool().optional(),
  linked: z.stringbool().optional(),
})

export type CreateTeacherInput = z.infer<typeof createTeacherSchema>
export type UpdateTeacherInput = z.infer<typeof updateTeacherSchema>
export type ListTeachersQuery = z.infer<typeof listTeachersQuerySchema>

/** PATCH só com `isActive: true`: reativa, sem o 409 de professor inativo. */
export const isTeacherReactivation = ({ isActive, ...rest }: UpdateTeacherInput) =>
  isActive === true && Object.values(rest).every((value) => value === undefined)
