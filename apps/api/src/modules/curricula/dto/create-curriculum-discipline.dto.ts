import { z } from 'zod'

// O unitId não entra: ele vem da rota. Aceitá-lo no corpo deixaria a FK
// composta recusar no banco, e o 400 claro viraria erro de driver.
export const CreateCurriculumDisciplineSchema = z.object({
  disciplineId: z.string().min(1),
  level: z.coerce.number().int().positive(),
  // Quantos slots a oferta precisa ocupar por semana. É o que permite
  // responder "o quadro está completo?" — por isso obrigatório.
  weeklyLessons: z.coerce.number().int().positive(),
  isRequired: z.boolean().optional(),
})

export type CreateCurriculumDisciplineInput = z.infer<typeof CreateCurriculumDisciplineSchema>
