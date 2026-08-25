import { z } from 'zod'

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(72), // bcrypt trunca em 72 bytes
})

export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>
