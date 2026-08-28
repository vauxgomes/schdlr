import { TermStatus } from '@prisma/client'
import { canTransition } from './term-status'

describe('canTransition', () => {
  it('walks the term through its life', () => {
    expect(canTransition(TermStatus.PLANNING, TermStatus.ADJUSTMENTS)).toBe(true)
    expect(canTransition(TermStatus.ADJUSTMENTS, TermStatus.STARTED)).toBe(true)
    expect(canTransition(TermStatus.STARTED, TermStatus.FINISHED)).toBe(true)
  })

  it('cancels from anywhere that is not finished', () => {
    expect(canTransition(TermStatus.PLANNING, TermStatus.CANCELLED)).toBe(true)
    expect(canTransition(TermStatus.ADJUSTMENTS, TermStatus.CANCELLED)).toBe(true)
    expect(canTransition(TermStatus.STARTED, TermStatus.CANCELLED)).toBe(true)
    expect(canTransition(TermStatus.FINISHED, TermStatus.CANCELLED)).toBe(false)
  })

  it('does not walk backwards, and does not skip a step', () => {
    expect(canTransition(TermStatus.ADJUSTMENTS, TermStatus.PLANNING)).toBe(false)
    expect(canTransition(TermStatus.FINISHED, TermStatus.PLANNING)).toBe(false)
    expect(canTransition(TermStatus.PLANNING, TermStatus.STARTED)).toBe(false)
  })

  it('leaves a cancelled term where it is', () => {
    expect(canTransition(TermStatus.CANCELLED, TermStatus.PLANNING)).toBe(false)
    expect(canTransition(TermStatus.CANCELLED, TermStatus.STARTED)).toBe(false)
  })

  it('refuses staying in the same state', () => {
    expect(canTransition(TermStatus.STARTED, TermStatus.STARTED)).toBe(false)
  })
})
