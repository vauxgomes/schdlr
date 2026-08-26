import { welcomeTemplate } from './welcome.template'

describe('welcomeTemplate', () => {
  it('addresses the person by name', () => {
    const template = welcomeTemplate({ name: 'Developer', email: 'developer@schdlr.test' })

    expect(template.subject).toBe('Bem-vindo ao schdlr')
    expect(template.html).toContain('Developer')
  })
})
