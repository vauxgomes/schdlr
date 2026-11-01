import { z } from 'zod'

// O estado inteiro da célula, os três campos obrigatórios. Oferta de fora do projeto e local de
// fora da unidade são 400 do service, não formato. Bloqueada é vazia (0002).
export const putBoardSlotSchema = z
  .object({
    offeringId: z.string().nullable(),
    locationId: z.string().nullable(),
    isBlocked: z.boolean(),
  })
  .refine((cell) => !cell.isBlocked || (cell.offeringId === null && cell.locationId === null), {
    path: ['isBlocked'],
    message: 'A blocked slot must be empty',
    params: { code: 'BLOCKED_SLOT_MUST_BE_EMPTY' },
  })

export type PutBoardSlotInput = z.infer<typeof putBoardSlotSchema>

/** Sem oferta, sem local e desbloqueada: a célula não tem linha (0020). */
export const isEmptyCell = ({ offeringId, locationId, isBlocked }: PutBoardSlotInput) =>
  offeringId === null && locationId === null && !isBlocked
