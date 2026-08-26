import { z } from 'zod'
import { CreateLocationSchema } from './create-location.dto'

export const UpdateLocationSchema = CreateLocationSchema.extend({
  isActive: z.boolean(),
}).partial()

export type UpdateLocationInput = z.infer<typeof UpdateLocationSchema>
