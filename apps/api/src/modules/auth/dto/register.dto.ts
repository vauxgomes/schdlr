import { z } from 'zod'

export const RegisterSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().toLowerCase(),
  password: z.string().min(8).max(72), // bcrypt trunca em 72 bytes
})

export type RegisterInput = z.infer<typeof RegisterSchema>
