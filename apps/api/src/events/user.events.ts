// Nome do evento é o fato consumado, não o que se deve fazer com ele. Quem
// emite não sabe quantos escutam nem por qual canal — e é essa ignorância que
// permite acrescentar notificação ou auditoria sem tocar no serviço.
export const UserEvent = {
  Registered: 'user.registered',
  PasswordResetRequested: 'user.password-reset-requested',
} as const

export type UserRegisteredPayload = {
  name: string
  email: string
}

export type PasswordResetRequestedPayload = {
  name: string
  email: string
  resetUrl: string
  expiresInMinutes: number
}
