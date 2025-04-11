import { logger } from '@/utils/logger'
import { TelegrafBotTester } from '../../testers/TelegrafBotTester'
import { TestResult } from '../../types'
import { createMockAvatarBot } from '../../helpers/createMockAvatarBot'
import { AVATAR_BOT_DEFAULTS } from '../../test-config'

/**
 * Тестирует основное взаимодействие с аватар-ботом
 */
export async function testAvatarBotBasicInteraction(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста базового взаимодействия с аватар-ботом', {
      description: 'Testing basic avatar bot interaction',
    })

    // Создаем тестового аватар-бота
    const mockAvatarBot = await createMockAvatarBot({
      botName: AVATAR_BOT_DEFAULTS.botName,
      ambassadorId: AVATAR_BOT_DEFAULTS.ambassadorId.toString(),
      avatarUrl: AVATAR_BOT_DEFAULTS.avatarUrl,
      isActive: true,
    })

    logger.info('✅ Создан тестовый аватар-бот', {
      description: 'Created test avatar bot',
      botId: mockAvatarBot.id,
      botName: mockAvatarBot.bot_name,
      avatarUrl: mockAvatarBot.avatar_url,
    })

    // Создание тестера для взаимодействия с ботом
    const botTester = new TelegrafBotTester(AVATAR_BOT_DEFAULTS.botName)
    const userId = AVATAR_BOT_DEFAULTS.userId

    // Симуляция отправки команды /start
    await botTester.simulateMessage(userId, '/start')

    // Проверяем, что бот отправил приветственное сообщение
    const hasGreeting = botTester.hasMessageWithText(userId, 'Привет')
    if (!hasGreeting) {
      throw new Error('Бот не отправил приветственное сообщение')
    }

    // Проверяем, что есть кнопка для выбора действия
    const hasActionButton = botTester.hasInlineButton(userId, 'Начать разговор')
    if (!hasActionButton) {
      throw new Error('Бот не отправил кнопку "Начать разговор"')
    }

    // Симуляция отправки текстового запроса боту
    await botTester.simulateMessage(userId, 'Расскажи о себе')

    // Проверяем, что получен ответ, содержащий информацию о боте
    const hasInformation = botTester.hasMessageWithText(userId, 'Я аватар-бот')

    if (!hasInformation) {
      throw new Error('Бот не отправил информацию о себе')
    }

    logger.info(
      '✅ Тест базового взаимодействия с аватар-ботом успешно пройден',
      {
        description: 'Avatar bot basic interaction test passed',
      }
    )

    return {
      success: true,
      name: 'Avatar Bot Basic Interaction Test',
      message: 'Тест базового взаимодействия с аватар-ботом успешно пройден',
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте взаимодействия с аватар-ботом', {
      description: 'Error in avatar bot interaction test',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: 'Avatar Bot Basic Interaction Test',
      message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Тестирует отправку изображений аватар-ботом
 */
export async function testAvatarBotImageSending(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста отправки изображений аватар-ботом', {
      description: 'Testing avatar bot image sending',
    })

    // Создаем тестового аватар-бота
    const mockAvatarBot = await createMockAvatarBot({
      botName: AVATAR_BOT_DEFAULTS.botName,
      ambassadorId: AVATAR_BOT_DEFAULTS.ambassadorId.toString(),
      avatarUrl: AVATAR_BOT_DEFAULTS.avatarUrl,
      isActive: true,
    })

    logger.info('✅ Создан тестовый аватар-бот с аватаркой', {
      description: 'Created test avatar bot with avatar',
      botId: mockAvatarBot.id,
      botName: mockAvatarBot.bot_name,
      avatarUrl: mockAvatarBot.avatar_url,
    })

    // Создание тестера для взаимодействия с ботом
    const botTester = new TelegrafBotTester(AVATAR_BOT_DEFAULTS.botName)
    const userId = AVATAR_BOT_DEFAULTS.userId

    // Симуляция запроса на отправку изображения
    await botTester.simulateMessage(userId, 'Покажи мне свою аватарку')

    // Проверяем ответы (в данном случае это условно, так как мы не можем проверить реальную отправку фото в моке)
    const messages = botTester.getSentMessages(userId)
    const hasResponse = messages.length > 0

    if (!hasResponse) {
      throw new Error('Бот не отправил ответ на запрос аватарки')
    }

    logger.info('✅ Тест отправки изображений аватар-ботом успешно пройден', {
      description: 'Avatar bot image sending test passed',
    })

    return {
      success: true,
      name: 'Avatar Bot Image Sending Test',
      message: 'Тест отправки изображений аватар-ботом успешно пройден',
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте отправки изображений аватар-ботом', {
      description: 'Error in avatar bot image sending test',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: 'Avatar Bot Image Sending Test',
      message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
