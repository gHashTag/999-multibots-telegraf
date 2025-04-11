import { logger } from '@/utils/logger'
import { TelegrafBotTester } from '../testers/TelegrafBotTester'
import { TestResult } from '../types'

/**
 * Демонстрирует использование TelegrafBotTester для тестирования взаимодействия с ботом
 */
export async function runTelegrafBotTesterExample(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск примера использования TelegrafBotTester', {
      description: 'Running TelegrafBotTester example',
    })

    // Создание тестера
    const botTester = new TelegrafBotTester('example_token')
    const userId = 123456789

    // Симуляция сообщения от пользователя
    await botTester.simulateMessage(userId, 'Привет, бот!')

    // Пример проверки отправленных сообщений
    // Обычно здесь был бы вызов реального обработчика бота,
    // который бы отправил ответное сообщение
    if (botTester.getSentMessages(userId).length === 0) {
      // Для демонстрации имитируем получение ответа от бота
      const context = botTester.getUserContext(userId)
      await context.reply('Привет! Чем могу помочь?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Опция 1', callback_data: 'option_1' }],
            [{ text: 'Опция 2', callback_data: 'option_2' }],
          ],
        },
      })
    }

    // Проверяем, что бот отправил ожидаемый ответ
    const hasGreeting = botTester.hasMessageWithText(userId, 'Привет!')
    if (!hasGreeting) {
      throw new Error('Бот не отправил приветственное сообщение')
    }

    // Проверяем наличие кнопки
    const hasOption1 = botTester.hasInlineButton(userId, 'Опция 1')
    if (!hasOption1) {
      throw new Error('В сообщении отсутствует кнопка "Опция 1"')
    }

    // Симуляция нажатия на кнопку
    const updatedContext = await botTester.simulateInlineButtonClick(
      userId,
      'Опция 1'
    )

    // В реальном тесте здесь был бы вызов обработчика callback query
    // Для демонстрации имитируем ответ от бота
    await updatedContext.reply('Вы выбрали опцию 1!')

    // Проверяем ответ после нажатия кнопки
    const hasOptionResponse = botTester.hasMessageWithText(
      userId,
      'Вы выбрали опцию 1'
    )
    if (!hasOptionResponse) {
      throw new Error('Бот не отправил ответ на выбор опции')
    }

    // Очистка сообщений
    botTester.clearMessages(userId)

    // Проверяем, что сообщения очищены
    if (botTester.getSentMessages(userId).length > 0) {
      throw new Error('Сообщения не были очищены')
    }

    logger.info('✅ Пример TelegrafBotTester успешно выполнен', {
      description: 'TelegrafBotTester example completed successfully',
    })

    return {
      success: true,
      name: 'TelegrafBotTester Example',
      message: 'Пример использования TelegrafBotTester успешно выполнен',
    }
  } catch (error) {
    logger.error('❌ Ошибка в примере TelegrafBotTester', {
      description: 'Error in TelegrafBotTester example',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: 'TelegrafBotTester Example',
      message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
