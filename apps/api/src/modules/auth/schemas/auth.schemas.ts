import { z } from 'zod'

import { OTP_LENGTH } from '../auth.constants'

// Normalizado antes de validar e de qualquer consulta: o e-mail é guardado em minúsculas.
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email())

export const signUpSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
})

export const requestCodeSchema = z.object({ email: emailSchema })

export const signInSchema = z.object({
  email: emailSchema,
  code: z.string().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), `Must be ${OTP_LENGTH} digits`),
})

export type SignUpInput = z.infer<typeof signUpSchema>
export type RequestCodeInput = z.infer<typeof requestCodeSchema>
export type SignInInput = z.infer<typeof signInSchema>
