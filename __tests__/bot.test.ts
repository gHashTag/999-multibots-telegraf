import { Telegraf } from 'telegraf'
import { validateBotToken } from '../src/bot'

jest.mock('telegraf', () => ({
  Telegraf: jest.fn().mockImplementation(() => ({
    telegram: {
      getMe: jest
        .fn()
        .mockResolvedValueOnce({ ok: true }) // success case
        .mockRejectedValueOnce(new Error('Invalid token')), // error case
    },
  })),
}))

describe('validateBotToken', () => {
  it('should return true for valid token', async () => {
    const result = await validateBotToken('valid_token')
    expect(result).toBe(true)
  })

  it('should return false for invalid token', async () => {
    const result = await validateBotToken('invalid_token')
    expect(result).toBe(false)
  })
})

// Mock всего Telegraf
jest.mock('telegraf')

describe('Bot functionality', () => {
  describe('validateBotToken', () => {
    beforeEach(() => {
      // Очищаем все моки перед каждым тестом
      jest.clearAllMocks()
    })

    it('should return true for valid token', async () => {
      // Настраиваем mock для успешного вызова getMe
      const mockGetMe = jest.fn().mockResolvedValue({
        id: 123456789,
        is_bot: true,
        first_name: 'Test Bot',
        username: 'test_bot',
      })

      // Mock реализации Telegraf
      ;(Telegraf as jest.MockedClass<typeof Telegraf>).prototype.telegram = {
        getMe: mockGetMe,
      } as any

      const result = await validateBotToken('valid_token')
      expect(result).toBe(true)
      expect(mockGetMe).toHaveBeenCalledTimes(1)
    })

    it('should return false for invalid token', async () => {
      // Настраиваем mock для ошибки
      const mockGetMe = jest.fn().mockRejectedValue(new Error('Invalid token'))

      ;(Telegraf as jest.MockedClass<typeof Telegraf>).prototype.telegram = {
        getMe: mockGetMe,
      } as any

      const result = await validateBotToken('invalid_token')
      expect(result).toBe(false)
      expect(mockGetMe).toHaveBeenCalledTimes(1)
    })

    it('should handle bot info structure', async () => {
      const mockBotInfo = {
        id: 987654321,
        is_bot: true,
        first_name: 'Another Bot',
        username: 'another_bot',
      }
      const mockGetMe = jest.fn().mockResolvedValue(mockBotInfo)

      ;(Telegraf as jest.MockedClass<typeof Telegraf>).prototype.telegram = {
        getMe: mockGetMe,
      } as any

      const result = await validateBotToken('another_valid_token')
      expect(result).toBe(true)
      expect(mockGetMe).toHaveBeenCalledTimes(1)
    })
  })
})
