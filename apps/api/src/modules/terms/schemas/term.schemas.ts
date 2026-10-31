import { TermStatus } from '@prisma/client'
import { z } from 'zod'

import { nameSchema } from '@modules/auth/schemas/auth.schemas'

// Data sem hora, YYYY-MM-DD. Comparar as strings é comparar as datas.
const dateSchema = z.iso.date()

/** O item de VALIDATION_FAILED para datas invertidas, no Zod e no service (PATCH com uma só). */
export const END_BEFORE_START = {
  path: 'endDate',
  code: 'END_BEFORE_START',
  message: 'End date must not be before start date',
} as const

const endNotBeforeStart = (body: { startDate?: string; endDate?: string }) =>
  !body.startDate || !body.endDate || body.endDate >= body.startDate

const endNotBeforeStartIssue = {
  path: [END_BEFORE_START.path],
  message: END_BEFORE_START.message,
  params: { code: END_BEFORE_START.code },
}

// status é ignorado: o semestre nasce em PLANNING e só a rota …/status o muda. Chaves extras são
// descartadas pelo z.object.
export const createTermSchema = z
  .object({ name: nameSchema, startDate: dateSchema, endDate: dateSchema })
  .refine(endNotBeforeStart, endNotBeforeStartIssue)

export const updateTermSchema = z
  .object({
    name: nameSchema.optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'At least one field is required',
    params: { code: 'EMPTY_UPDATE' },
  })
  .refine(endNotBeforeStart, endNotBeforeStartIssue)

export const changeTermStatusSchema = z.object({ status: z.enum(TermStatus) })

export const listTermsQuerySchema = z.object({ status: z.enum(TermStatus).optional() })

export type CreateTermInput = z.infer<typeof createTermSchema>
export type UpdateTermInput = z.infer<typeof updateTermSchema>
export type ChangeTermStatusInput = z.infer<typeof changeTermStatusSchema>
export type ListTermsQuery = z.infer<typeof listTermsQuerySchema>
