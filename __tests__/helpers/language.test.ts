import { isRussian } from '@/helpers/language'

describe('isRussian', () => {
  it('returns true when language_code is ru', () => {
    const ctx = { from: { language_code: 'ru' } } as any
    expect(isRussian(ctx)).toBe(true)
  })

  it('returns false when language_code is not ru', () => {
    const ctx = { from: { language_code: 'en' } } as any
    expect(isRussian(ctx)).toBe(false)
  })

  it('returns false when ctx.from is undefined', () => {
    const ctx = {} as any
    expect(isRussian(ctx)).toBe(false)
  })
})
