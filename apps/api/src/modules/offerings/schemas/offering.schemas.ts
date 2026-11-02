import { z } from 'zod'

// O teacherId é o de um Teacher (0021); fora do formato é INVALID_TEACHER do service, não formato.
// Só teacherId é editável; chaves extras são descartadas pelo z.object.
export const updateOfferingSchema = z
  .object({ teacherId: z.string().nullable().optional() })
  .refine((body) => body.teacherId !== undefined, {
    message: 'At least one field is required',
    params: { code: 'EMPTY_UPDATE' },
  })

// `stringbool`, não `coerce.boolean`: o coerce lê a string "false" como true.
export const listOfferingsQuerySchema = z.object({
  teacherId: z.string().optional(),
  withoutTeacher: z.stringbool().optional(),
})

export type UpdateOfferingInput = z.infer<typeof updateOfferingSchema>
export type ListOfferingsQuery = z.infer<typeof listOfferingsQuerySchema>
