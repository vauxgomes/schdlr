import { updateMemberSchema } from './member.schemas'

describe('updateMemberSchema', () => {
  it('aceita uma flag e descarta o resto', () => {
    expect(updateMemberSchema.parse({ isTeacher: false, userId: 'x' })).toEqual({
      isTeacher: false,
    })
  })

  it('sem flag é EMPTY_UPDATE', () => {
    const result = updateMemberSchema.safeParse({})
    expect(result.success).toBe(false)
    const [issue] = result.error!.issues
    expect(issue.code === 'custom' && issue.params).toEqual({ code: 'EMPTY_UPDATE' })
  })
})
