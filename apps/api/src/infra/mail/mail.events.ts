export const MailEvent = {
  Welcome: 'mail.welcome',
} as const

export type WelcomeMailPayload = {
  name: string
  email: string
}
