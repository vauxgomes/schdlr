import { z } from 'zod'

const MINUTES_IN_A_DAY = 1440

// Minutos desde a meia-noite, hora de parede: sem tipo Time, sem fuso. 1440 é
// o fim do dia e vale como `endTime`, mas não como começo de nada.
const minuteOfDay = z.coerce.number().int().min(0).max(MINUTES_IN_A_DAY)

export const CreateTimeSlotSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    startTime: minuteOfDay,
    endTime: minuteOfDay,
  })
  .refine((slot) => slot.endTime > slot.startTime, {
    path: ['endTime'],
    message: 'endTime must be after startTime',
  })

export type CreateTimeSlotInput = z.infer<typeof CreateTimeSlotSchema>
