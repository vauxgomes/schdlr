import { createInvitationSchema, listInvitationsQuerySchema } from './invitation.schemas'

describe('createInvitationSchema', () => {
  it('normaliza o e-mail e põe as flags em false', () => {
    expect(createInvitationSchema.parse({ email: ' Nova@X.dev ' })).toEqual({
      email: 'nova@x.dev',
      isManager: false,
      isTeacher: false,
    })
  })

  it('nome segue o nameSchema', () => {
    expect(createInvitationSchema.safeParse({ email: 'a@x.dev', name: '' }).success).toBe(false)
    expect(createInvitationSchema.parse({ email: 'a@x.dev', name: ' Nova ' }).name).toBe('Nova')
  })
})

describe('listInvitationsQuerySchema', () => {
  it('aceita os valores do enum e recusa o resto', () => {
    expect(listInvitationsQuerySchema.parse({ status: 'EXPIRED' })).toEqual({ status: 'EXPIRED' })
    expect(listInvitationsQuerySchema.parse({})).toEqual({})
    expect(listInvitationsQuerySchema.safeParse({ status: 'OUTRO' }).success).toBe(false)
  })
})
