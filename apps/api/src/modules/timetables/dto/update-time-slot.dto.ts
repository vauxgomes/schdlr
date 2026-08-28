import { z } from 'zod'

const MINUTES_IN_A_DAY = 1440

const minuteOfDay = z.coerce.number().int().min(0).max(MINUTES_IN_A_DAY)

// Sem `refine` aqui: num PATCH parcial a ordem das horas só se confere contra
// o que já está gravado, e isso mora no service.
export const UpdateTimeSlotSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    startTime: minuteOfDay,
    endTime: minuteOfDay,
    isActive: z.boolean(),
  })
  .partial()

export type UpdateTimeSlotInput = z.infer<typeof UpdateTimeSlotSchema>
