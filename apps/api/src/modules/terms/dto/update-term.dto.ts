import { z } from 'zod'

// `status` não entra aqui de propósito: transição é máquina de estado, e sai
// pelo endpoint próprio. Campo desconhecido no corpo é ignorado pelo Zod, então
// mandar `status` no PATCH genérico simplesmente não faz nada.
export const UpdateTermSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .partial()

export type UpdateTermInput = z.infer<typeof UpdateTermSchema>
