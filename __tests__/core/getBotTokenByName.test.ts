import { getBotTokenByName } from '@/core/getBotTokenByName'
// Мокаем logger, чтобы перехватить предупреждения
jest.mock('@/utils/logger', () => ({
  logger: { warn: jest.fn() }
}))
import { logger } from '@/utils/logger'

describe('getBotTokenByName', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...ORIGINAL_ENV }
  })
  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  it('возвращает токен из process.env, если имя бота есть в маппинге и переменная задана', () => {
    // Подготавливаем env
    process.env.BOT_TOKEN_TEST_1 = 'test-token-1'
    const token = getBotTokenByName('ai_koshey_bot')
    expect(token).toBe('test-token-1')
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('возвращает undefined и логгирует предупреждение, если имя бота не в маппинге', () => {
    const token = getBotTokenByName('unknown_bot')
    expect(token).toBeUndefined()
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('No environment variable mapped for bot name: unknown_bot')
    )
  })

  it('возвращает undefined и логгирует предупреждение, если маппинг есть, но переменная не задана', () => {
    // Убедимся, что переменная отсутствует
    delete process.env.BOT_TOKEN_TEST_2
    const token = getBotTokenByName('clip_maker_neuro_bot')
    expect(token).toBeUndefined()
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Token not found in environment variable: BOT_TOKEN_TEST_2')
    )
  })

  it('корректно обрабатывает другие ботов из маппинга', () => {
    process.env.BOT_TOKEN_1 = 'neuro-token'
    expect(getBotTokenByName('neuro_blogger_bot')).toBe('neuro-token')
    expect(logger.warn).not.toHaveBeenCalled()
  })
})