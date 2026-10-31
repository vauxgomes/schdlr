import { z } from 'zod'

// Termina no mesmo dia: 24:00 não existe, e nenhum horário atravessa a meia-noite.
export const hhmmSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

export const slotNameSchema = z.string().trim().min(1).max(40)

/** O item de VALIDATION_FAILED para horário sem duração, no Zod e no service (PATCH com uma só). */
export const END_NOT_AFTER_START = {
  path: 'endTime',
  code: 'END_NOT_AFTER_START',
  message: 'End time must be after start time',
} as const

// HH:MM com zero à esquerda: comparar as strings é comparar as horas.
const endAfterStart = (slot: { startTime?: string; endTime?: string }) =>
  !slot.startTime || !slot.endTime || slot.endTime > slot.startTime

const endAfterStartIssue = {
  path: [END_NOT_AFTER_START.path],
  message: END_NOT_AFTER_START.message,
  params: { code: END_NOT_AFTER_START.code },
}

export const createTimeSlotSchema = z
  .object({ name: slotNameSchema, startTime: hhmmSchema, endTime: hhmmSchema })
  .refine(endAfterStart, endAfterStartIssue)

// Chaves extras são descartadas pelo z.object.
export const updateTimeSlotSchema = z
  .object({
    name: slotNameSchema.optional(),
    startTime: hhmmSchema.optional(),
    endTime: hhmmSchema.optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'At least one field is required',
    params: { code: 'EMPTY_UPDATE' },
  })
  .refine(endAfterStart, endAfterStartIssue)

export type CreateTimeSlotInput = z.infer<typeof createTimeSlotSchema>
export type UpdateTimeSlotInput = z.infer<typeof updateTimeSlotSchema>
