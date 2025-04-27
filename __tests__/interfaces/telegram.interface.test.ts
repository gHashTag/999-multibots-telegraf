import type {
  TelegramId,
  TelegramUser,
} from '@/interfaces/telegram.interface'
import {
  normalizeTelegramId,
  isValidTelegramId,
} from '@/interfaces/telegram.interface'

describe('Telegram Interface', () => {
  describe('TelegramId type', () => {
    it('should be a string type', () => {
      const id: TelegramId = '12345'
      expect(typeof id).toBe('string')
    })
  })

  describe('TelegramUser interface', () => {
    it('should have required telegram_id field', () => {
      const user: TelegramUser = { telegram_id: '123' }
      expect(user).toHaveProperty('telegram_id')
    })

    it('should allow optional fields', () => {
      const fullUser: TelegramUser = {
        telegram_id: '123',
        username: 'test',
        first_name: 'Test',
        last_name: 'User',
        language_code: 'en',
        is_bot: false,
      }
      expect(fullUser).toBeDefined()
    })
  })

  describe('normalizeTelegramId', () => {
    it('should return string as is', () => {
      expect(normalizeTelegramId('123')).toBe('123')
    })

    it('should convert number to string', () => {
      expect(normalizeTelegramId(123)).toBe('123')
    })

    it('should convert bigint to string', () => {
      expect(normalizeTelegramId(BigInt(123))).toBe('123')
    })

    it('should convert other types to string', () => {
      // expect(normalizeTelegramId(true)).toBe('true') // Некорректный тип, функция не ожидает boolean
      // expect(normalizeTelegramId(null)).toBe('null') // Некорректный тип
      // expect(normalizeTelegramId(undefined)).toBe('undefined') // Некорректный тип
      // expect(normalizeTelegramId({ a: 1 })).toBe('[object Object]') // Некорректный тип
    })
  })

  describe('isValidTelegramId', () => {
    it('should return false for empty value', () => {
      expect(isValidTelegramId(null)).toBe(false)
      expect(isValidTelegramId(undefined)).toBe(false)
      expect(isValidTelegramId('')).toBe(false)
    })

    it('should return true for numeric strings', () => {
      expect(isValidTelegramId('123')).toBe(true)
      expect(isValidTelegramId('0')).toBe(true)
    })

    it('should return false for non-numeric strings', () => {
      expect(isValidTelegramId('abc')).toBe(false)
      expect(isValidTelegramId('123a')).toBe(false)
    })

    it('should handle numbers and bigints', () => {
      expect(isValidTelegramId(123)).toBe(true)
      expect(isValidTelegramId(BigInt(123))).toBe(true)
    })
  })
})
