import { describe, it, expect, vi } from 'vitest'
import { isRussian } from '../../src/helpers/language'
import { MyContext } from '@/interfaces' // Import MyContext type

// Explicitly unmock the module to ensure we test the real implementation
vi.unmock('../../src/helpers/language')

// Helper to create a minimal mock context
const createMockContext = (languageCode?: string): MyContext => {
  return {
    from: {
      id: 123, // Example user ID
      is_bot: false,
      first_name: 'Test',
      language_code: languageCode,
    },
    // Add other necessary properties expected by MyContext, even if minimal/undefined
    chat: undefined, // Example: Assuming chat might be accessed minimally
    botInfo: undefined,
    // ... other properties as required by MyContext ...
  } as MyContext // Type assertion might be needed depending on MyContext complexity
}

describe('isRussian', () => {
  it('should return true for "ru" language code', () => {
    const ctx = createMockContext('ru')
    expect(isRussian(ctx)).toBe(true)
  })

  // The original function logic `languageCode === 'ru'` will be false for 'ru-RU'
  // Keep the test according to the *current* function logic.
  it('should return false for "ru-RU" language code (exact match)', () => {
    const ctx = createMockContext('ru-RU')
    expect(isRussian(ctx)).toBe(false)
  })

  it('should return false for "en" language code', () => {
    const ctx = createMockContext('en')
    expect(isRussian(ctx)).toBe(false)
  })

  it('should return false for "en-US" language code', () => {
    const ctx = createMockContext('en-US')
    expect(isRussian(ctx)).toBe(false)
  })

  it('should return false for undefined language code', () => {
    const ctx = createMockContext(undefined)
    expect(isRussian(ctx)).toBe(false)
  })

  it('should return false for an empty string language code', () => {
    const ctx = createMockContext('')
    expect(isRussian(ctx)).toBe(false)
  })

  it('should return false for a different language code like "fr"', () => {
    const ctx = createMockContext('fr')
    expect(isRussian(ctx)).toBe(false)
  })
})
