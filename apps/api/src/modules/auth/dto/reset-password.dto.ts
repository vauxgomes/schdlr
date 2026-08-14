import { z } from 'zod'

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(72), // bcrypt trunca em 72 bytes
})

export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>
