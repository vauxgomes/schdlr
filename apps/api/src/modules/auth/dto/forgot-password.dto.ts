import { z } from 'zod'

export const ForgotPasswordSchema = z.object({
  email: z.email().toLowerCase(),
})

export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>
