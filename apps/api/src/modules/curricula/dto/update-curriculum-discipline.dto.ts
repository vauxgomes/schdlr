import { z } from 'zod'
import { CreateCurriculumDisciplineSchema } from './create-curriculum-discipline.dto'

// A disciplina não se troca: trocar seria outro item da grade, e o unique
// [curriculumId, disciplineId] existe para que ela seja a identidade da linha.
export const UpdateCurriculumDisciplineSchema = CreateCurriculumDisciplineSchema.omit({
  disciplineId: true,
}).partial()

export type UpdateCurriculumDisciplineInput = z.infer<typeof UpdateCurriculumDisciplineSchema>
