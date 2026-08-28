import { describe, it, expect } from 'vitest'
import { extractPromoFromContext } from '../contextUtils'
import { MyContext } from '../../interfaces'

// Создаем мок-контекст для тестов
function createMockContext(messageText) {
  return {
    from: { id: 123456789 },
    message: { text: messageText },
  }
}

describe('ContextUtils Tests', () => {
  describe('extractPromoFromContext', () => {
    it('should detect /start neurovideo command', () => {
      const ctx = createMockContext('/start neurovideo')
      const result = extractPromoFromContext(ctx)

      expect(result).not.toBeNull()
      expect(result?.isPromo).toBe(true)
      expect(result?.parameter).toBe('neurovideo')
    })

    it('should detect /start neurophoto command', () => {
      const ctx = createMockContext('/start neurophoto')
      const result = extractPromoFromContext(ctx)

      expect(result).not.toBeNull()
      expect(result?.isPromo).toBe(true)
      expect(result?.parameter).toBe('neurophoto')
    })

    it('should detect /start promo neurovideo command', () => {
      const ctx = createMockContext('/start promo neurovideo')
      const result = extractPromoFromContext(ctx)

      expect(result).not.toBeNull()
      expect(result?.isPromo).toBe(true)
      expect(result?.parameter).toBe('neurovideo')
    })

    it('should detect /start promo without parameter', () => {
      const ctx = createMockContext('/start promo')
      const result = extractPromoFromContext(ctx)

      expect(result).not.toBeNull()
      expect(result?.isPromo).toBe(true)
      expect(result?.parameter).toBe('')
    })

    it('should NOT detect regular /start command', () => {
      const ctx = createMockContext('/start')
      const result = extractPromoFromContext(ctx)

      expect(result).toBeNull()
    })

    it('should NOT detect /start with numeric parameter (referral)', () => {
      const ctx = createMockContext('/start 123456789')
      const result = extractPromoFromContext(ctx)

      expect(result).toBeNull()
    })

    it('should handle case insensitive matching', () => {
      const ctx = createMockContext('/start NEUROVIDEO')
      const result = extractPromoFromContext(ctx)

      expect(result).not.toBeNull()
      expect(result?.isPromo).toBe(true)
      expect(result?.parameter).toBe('NEUROVIDEO')
    })

    it('should handle context without message', () => {
      const ctx = { from: { id: 123456789 } } as MyContext
      const result = extractPromoFromContext(ctx)

      expect(result).toBeNull()
    })

    it('should handle context without text message', () => {
      const ctx = {
        from: { id: 123456789 },
        message: { photo: [] },
      } as MyContext
      const result = extractPromoFromContext(ctx)

      expect(result).toBeNull()
    })
  })
})
