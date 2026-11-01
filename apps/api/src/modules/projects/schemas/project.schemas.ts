import { ProjectStatus } from '@prisma/client'
import { z } from 'zod'

import { nameSchema } from '@modules/auth/schemas/auth.schemas'

// Segunda a sexta, ou até sábado (0002).
const workingDaysSchema = z.literal([5, 6])

// Semestre e currículo que não são da unidade do caminho são 404 do service, não formato. status
// é ignorado: o projeto nasce PUBLISHED e só a rota …/status o muda.
export const createProjectSchema = z.object({
  name: nameSchema,
  termId: z.string(),
  curriculumId: z.string(),
  workingDays: workingDaysSchema.default(5),
})

// Semestre e currículo são fixos depois de criado. Chaves extras são descartadas pelo z.object.
export const updateProjectSchema = z
  .object({
    name: nameSchema.optional(),
    workingDays: workingDaysSchema.optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'At least one field is required',
    params: { code: 'EMPTY_UPDATE' },
  })

export const changeProjectStatusSchema = z.object({ status: z.enum(ProjectStatus) })

export const listProjectsQuerySchema = z.object({
  termId: z.string().optional(),
  status: z.enum(ProjectStatus).optional(),
})

export type CreateProjectInput = z.infer<typeof createProjectSchema>
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>
export type ChangeProjectStatusInput = z.infer<typeof changeProjectStatusSchema>
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>
