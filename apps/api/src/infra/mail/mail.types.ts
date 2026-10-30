export type MailMessage = {
  to: string
  subject: string
  text: string
  html?: string
}

/** O que um modelo devolve: a mensagem sem o destinatário. */
export type MailContent = Omit<MailMessage, 'to'>
