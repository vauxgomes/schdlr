import { LocationType } from '@prisma/client'
import { z } from 'zod'

export const CreateDisciplineSchema = z.object({
  name: z.string().trim().min(2).max(120),
  // Normalizado na entrada porque o unique do banco distingue caixa: sem
  // isto, 'poo' e 'POO' conviveriam como disciplinas diferentes na unidade.
  code: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .transform((code) => code.toUpperCase()),
  // Carga horária total prevista, em horas. Não confundir com weeklyLessons,
  // que é por currículo e mora em CurriculumDiscipline.
  workload: z.coerce.number().int().positive(),
  // `null` é resposta legítima: qualquer local serve.
  requiredLocationType: z.enum(LocationType).nullish(),
  color: z.string().trim().min(1).max(30).nullish(),
})

export type CreateDisciplineInput = z.infer<typeof CreateDisciplineSchema>
