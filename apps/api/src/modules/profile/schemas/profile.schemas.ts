import { z } from 'zod'

import { nameSchema } from '@modules/auth/schemas/auth.schemas'

// Só o nome é editável; chaves extras (email, systemRole) são descartadas pelo z.object.
export const updateProfileSchema = z.object({ name: nameSchema })

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
