import { z } from 'zod'

// Só isManager muda: ser professor é ter um Teacher (0021). Chaves extras são descartadas pelo
// z.object.
export const updateMemberSchema = z
  .object({
    isManager: z.boolean().optional(),
  })
  .refine((body) => body.isManager !== undefined, {
    message: 'At least one field is required',
    params: { code: 'EMPTY_UPDATE' },
  })

export type UpdateMemberInput = z.infer<typeof updateMemberSchema>
