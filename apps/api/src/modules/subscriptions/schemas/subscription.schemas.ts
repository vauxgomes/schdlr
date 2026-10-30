import { PlanType } from '@prisma/client'
import { z } from 'zod'

export const assignSubscriptionSchema = z
  .object({
    plan: z.enum(PlanType),
    expiresAt: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .optional(),
  })
  .superRefine(({ plan, expiresAt }, ctx) => {
    if (!expiresAt) return
    if (plan === 'GRACE') {
      ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'GRACE does not expire' })
    } else if (expiresAt <= new Date()) {
      ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Must be in the future' })
    }
  })

export type AssignSubscriptionInput = z.infer<typeof assignSubscriptionSchema>
