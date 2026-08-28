import { overlaps } from './overlap'

describe('overlaps', () => {
  const morning = { startTime: 420, endTime: 470 }

  it('is false for ranges that only touch', () => {
    expect(overlaps(morning, { startTime: 470, endTime: 520 })).toBe(false)
    expect(overlaps(morning, { startTime: 370, endTime: 420 })).toBe(false)
  })

  it('is true when one starts inside the other', () => {
    expect(overlaps(morning, { startTime: 450, endTime: 520 })).toBe(true)
    expect(overlaps(morning, { startTime: 400, endTime: 430 })).toBe(true)
  })

  it('is true for a range that swallows the other', () => {
    expect(overlaps(morning, { startTime: 400, endTime: 500 })).toBe(true)
    expect(overlaps({ startTime: 430, endTime: 440 }, morning)).toBe(true)
  })

  it('is true for the very same range', () => {
    expect(overlaps(morning, morning)).toBe(true)
  })

  it('is false for ranges far apart', () => {
    expect(overlaps(morning, { startTime: 1080, endTime: 1130 })).toBe(false)
  })
})
