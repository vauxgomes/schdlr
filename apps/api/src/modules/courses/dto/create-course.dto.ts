import { z } from 'zod'

export const CreateCourseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  // Normalizado na entrada porque o unique do banco distingue caixa: sem
  // isto, 'tads' e 'TADS' conviveriam como cursos diferentes na mesma unidade.
  code: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .transform((code) => code.toUpperCase()),
})

export type CreateCourseInput = z.infer<typeof CreateCourseSchema>
