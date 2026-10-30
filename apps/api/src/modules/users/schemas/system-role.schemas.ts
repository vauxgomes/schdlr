import { z } from 'zod'

// MASTER fica de fora: só a seed cria o master (spec 0002).
export const setSystemRoleSchema = z.object({ systemRole: z.enum(['USER', 'SUPPORT']) })

export type SetSystemRoleInput = z.infer<typeof setSystemRoleSchema>
