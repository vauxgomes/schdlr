import { z } from 'zod'

// Só as flags mudam; chaves extras são descartadas pelo z.object.
export const updateMemberSchema = z
  .object({
    isManager: z.boolean().optional(),
    isTeacher: z.boolean().optional(),
  })
  .refine((body) => body.isManager !== undefined || body.isTeacher !== undefined, {
    message: 'At least one field is required',
    params: { code: 'EMPTY_UPDATE' },
  })

export type UpdateMemberInput = z.infer<typeof updateMemberSchema>
