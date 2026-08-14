export const MailEvent = {
  Welcome: 'mail.welcome',
  PasswordReset: 'mail.password-reset',
} as const

export type WelcomeMailPayload = {
  name: string
  email: string
}

export type PasswordResetMailPayload = {
  name: string
  email: string
  resetUrl: string
  expiresInMinutes: number
}
