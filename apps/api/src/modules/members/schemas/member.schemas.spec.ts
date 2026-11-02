import { updateMemberSchema } from './member.schemas'

describe('updateMemberSchema', () => {
  it('aceita isManager e descarta o resto', () => {
    expect(updateMemberSchema.parse({ isManager: false, userId: 'x' })).toEqual({
      isManager: false,
    })
  })

  it('sem isManager é EMPTY_UPDATE, inclusive só com isTeacher (0021)', () => {
    const result = updateMemberSchema.safeParse({ isTeacher: true })
    expect(result.success).toBe(false)
    const [issue] = result.error!.issues
    expect(issue.code === 'custom' && issue.params).toEqual({ code: 'EMPTY_UPDATE' })
  })
})
