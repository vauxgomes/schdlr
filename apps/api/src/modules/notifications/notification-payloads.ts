import { NotificationType } from '@prisma/client'
import { z } from 'zod'

// O tipo determina a forma do payload, e a validação acontece na escrita: uma
// notificação malformada gravada hoje só apareceria como tela quebrada meses
// depois, longe de quem a criou.
export const NotificationPayloadSchema = {
  [NotificationType.UNIT_INVITE]: z.object({
    unitId: z.string().min(1),
    unitName: z.string().min(1),
    // Token, e não id: é com ele que se aceita, e a notificação é lida só
    // pelo próprio convidado.
    token: z.string().min(1),
  }),
  [NotificationType.MEMBER_ACTIVATED]: z.object({
    unitId: z.string().min(1),
    unitName: z.string().min(1),
  }),
  [NotificationType.MEMBER_DEACTIVATED]: z.object({
    unitId: z.string().min(1),
    unitName: z.string().min(1),
  }),
  [NotificationType.PROJECT_ASSISTANT_ADDED]: z.object({
    unitId: z.string().min(1),
    projectId: z.string().min(1),
    projectName: z.string().min(1),
  }),
  [NotificationType.TERM_STARTED]: z.object({
    unitId: z.string().min(1),
    termId: z.string().min(1),
    termName: z.string().min(1),
  }),
  // Sem produtor por enquanto: vencimento não é ação de ninguém. O schema
  // existe para o dia em que houver quem dispare.
  [NotificationType.SUBSCRIPTION_EXPIRING]: z.object({
    subscriptionId: z.string().min(1),
    expiresAt: z.string().min(1),
  }),
  [NotificationType.SUBSCRIPTION_EXPIRED]: z.object({
    subscriptionId: z.string().min(1),
  }),
} as const satisfies Record<NotificationType, z.ZodType>

export type NotificationPayload<T extends NotificationType> = z.infer<
  (typeof NotificationPayloadSchema)[T]
>
