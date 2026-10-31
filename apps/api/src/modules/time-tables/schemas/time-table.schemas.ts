import { z } from 'zod'

import { nameSchema } from '@modules/auth/schemas/auth.schemas'
import { createTimeSlotSchema } from '@modules/time-slots/schemas/time-slot.schemas'
import { overlaps, toMinutes } from '@modules/time-slots/time'

/** Um dia inteiro em horários de 30 min cabe. */
export const MAX_SLOTS = 48

const minutesOf = ({ startTime, endTime }: { startTime: string; endTime: string }) => ({
  startTime: toMinutes(startTime),
  endTime: toMinutes(endTime),
})

// Sobreposição dentro da lista é erro de entrada: o item vai no segundo da dupla.
export const createTimeTableSchema = z.object({
  name: nameSchema,
  slots: z
    .array(createTimeSlotSchema)
    .max(MAX_SLOTS)
    .default([])
    .superRefine((slots, ctx) => {
      slots.forEach((slot, i) => {
        const clash = slots.slice(0, i).some((other) => overlaps(minutesOf(other), minutesOf(slot)))
        if (clash) {
          ctx.addIssue({
            code: 'custom',
            path: [i],
            message: 'Time slots overlap',
            params: { code: 'SLOTS_OVERLAP' },
          })
        }
      })
    }),
})

// Os horários têm rotas próprias. Chaves extras são descartadas pelo z.object.
export const updateTimeTableSchema = z
  .object({
    name: nameSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'At least one field is required',
    params: { code: 'EMPTY_UPDATE' },
  })

export const duplicateTimeTableSchema = z.object({ name: nameSchema })

export type CreateTimeTableInput = z.infer<typeof createTimeTableSchema>
export type UpdateTimeTableInput = z.infer<typeof updateTimeTableSchema>
export type DuplicateTimeTableInput = z.infer<typeof duplicateTimeTableSchema>

/** PATCH só com `isActive: true`: reativa, sem o 409 de bloco inativo. */
export const isTimeTableReactivation = (body: UpdateTimeTableInput) =>
  body.isActive === true && body.name === undefined
