import { describe, it, expect } from 'vitest'
import { isRussian } from '@/helpers/language'
import { createMockContext } from '@/../src/__tests__/helpers/context'

describe('isRussian', () => {
  it('should return true for Russian language codes', () => {
    const ctxRu = createMockContext({ from: { language_code: 'ru' } })
    const ctxRuRu = createMockContext({ from: { language_code: 'ru-RU' } })
    expect(isRussian(ctxRu)).toBe(true)
    expect(isRussian(ctxRuRu)).toBe(true)
  })

  it('should return false for non-Russian language codes', () => {
    const ctxEn = createMockContext({ from: { language_code: 'en' } })
    const ctxEnUs = createMockContext({ from: { language_code: 'en-US' } })
    const ctxFr = createMockContext({ from: { language_code: 'fr' } })
    const ctxDe = createMockContext({ from: { language_code: 'de' } })
    expect(isRussian(ctxEn)).toBe(false)
    expect(isRussian(ctxEnUs)).toBe(false)
    expect(isRussian(ctxFr)).toBe(false)
    expect(isRussian(ctxDe)).toBe(false)
  })

  it('should return false for context without from', () => {
    const ctxNoFrom = createMockContext({ from: undefined })
    expect(isRussian(ctxNoFrom)).toBe(false)
  })

  it('should return false for context without language_code', () => {
    const ctxNoLangCode = createMockContext({
      from: { language_code: undefined },
    })
    expect(isRussian(ctxNoLangCode)).toBe(false)
  })

  it('should be case-insensitive', () => {
    const ctxRU = createMockContext({ from: { language_code: 'RU' } })
    const ctxRuRuLower = createMockContext({ from: { language_code: 'ru-ru' } })
    const ctxEN = createMockContext({ from: { language_code: 'EN' } })
    expect(isRussian(ctxRU)).toBe(true)
    expect(isRussian(ctxRuRuLower)).toBe(true)
    expect(isRussian(ctxEN)).toBe(false)
  })
})
