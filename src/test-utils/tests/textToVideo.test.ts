import { InngestTester } from '../inngest-tests'
import { logger } from '@/utils/logger'
import { TEST_CONFIG } from '../test-config'

describe('textToVideo', () => {
  let tester: InngestTester

  beforeEach(() => {
    tester = new InngestTester()
  })

  it('🎯 должен успешно создавать видео из текста', async () => {
    logger.info({
      message: '🚀 Начало теста создания видео из текста',
      description: 'Starting text to video test',
    })

    const result = await tester.textToVideo({
      text: 'Тестовый текст для видео',
      telegram_id: TEST_CONFIG.users.main.telegramId,
      is_ru: true,
      bot_name: TEST_CONFIG.users.main.botName,
    })

    logger.info({
      message: '✅ Проверка результата',
      description: 'Checking test result',
      result,
    })

    expect(result.success).toBe(true)
    expect(result.videoBuffer).toBeDefined()
  })

  it('❌ должен обрабатывать ошибку при отсутствии текста', async () => {
    logger.info({
      message: '🚀 Начало теста обработки ошибки',
      description: 'Starting error handling test',
    })

    await expect(
      tester.textToVideo({
        text: '',
        telegram_id: TEST_CONFIG.users.main.telegramId,
        is_ru: true,
        bot_name: TEST_CONFIG.users.main.botName,
      })
    ).rejects.toThrow('Missing required fields')
  })

  it('💰 должен корректно обрабатывать оплату', async () => {
    logger.info({
      message: '🚀 Начало теста обработки оплаты',
      description: 'Starting payment processing test',
    })

    const result = await tester.textToVideo({
      text: 'Тестовый текст для видео',
      telegram_id: TEST_CONFIG.users.main.telegramId,
      is_ru: true,
      bot_name: TEST_CONFIG.users.main.botName,
    })

    logger.info({
      message: '✅ Проверка результата оплаты',
      description: 'Checking payment result',
      result,
    })

    expect(result.paymentProcessed).toBe(true)
  })
})
