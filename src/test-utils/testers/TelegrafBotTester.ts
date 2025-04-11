import { logger } from '@/utils/logger'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { createMockBot, MockTelegraf } from '../mocks/botMock'
import { createMockContext } from '../helpers/createMockContext'

/**
 * Класс для тестирования функциональности Telegraf ботов
 */
export class TelegrafBotTester {
  bot: MockTelegraf
  mockContexts: Map<number, MyContext> = new Map()

  constructor(token: string = 'test_token') {
    this.bot = createMockBot(token)
    logger.info('🤖 Создан тестер для Telegraf бота', {
      description: 'Created Telegraf bot tester',
      token,
    })
  }

  /**
   * Создает и сохраняет новый контекст пользователя
   * @param userId ID пользователя
   * @param options Дополнительные опции для контекста
   * @returns Созданный контекст
   */
  createUserContext(
    userId: number,
    options: Parameters<typeof createMockContext>[0] = {}
  ): MyContext {
    const context = createMockContext({
      userId,
      ...options,
    })

    this.mockContexts.set(userId, context)
    logger.info('👤 Создан контекст пользователя', {
      description: 'Created user context',
      userId,
    })

    return context
  }

  /**
   * Получает существующий контекст пользователя или создает новый
   * @param userId ID пользователя
   * @param options Дополнительные опции для контекста
   * @returns Контекст пользователя
   */
  getUserContext(
    userId: number,
    options: Parameters<typeof createMockContext>[0] = {}
  ): MyContext {
    if (this.mockContexts.has(userId)) {
      return this.mockContexts.get(userId)!
    }

    return this.createUserContext(userId, options)
  }

  /**
   * Симулирует отправку сообщения пользователем боту
   * @param userId ID пользователя
   * @param text Текст сообщения
   * @returns Обновленный контекст пользователя
   */
  async simulateMessage(userId: number, text: string): Promise<MyContext> {
    const context = this.getUserContext(userId, { messageText: text })

    logger.info('📩 Симуляция сообщения от пользователя', {
      description: 'Simulating message from user',
      userId,
      text,
    })

    return context
  }

  /**
   * Получает все сообщения, отправленные конкретному пользователю
   * @param userId ID пользователя
   * @returns Массив отправленных сообщений
   */
  getSentMessages(userId: number): any[] {
    const context = this.getUserContext(userId)
    return (context as any).sentReplies || []
  }

  /**
   * Проверяет, было ли отправлено сообщение, содержащее указанный текст
   * @param userId ID пользователя
   * @param text Текст для поиска
   * @returns true, если найдено сообщение с указанным текстом
   */
  hasMessageWithText(userId: number, text: string): boolean {
    const messages = this.getSentMessages(userId)
    return messages.some(msg => msg.text && msg.text.includes(text))
  }

  /**
   * Проверяет, было ли отправлено сообщение с инлайн-кнопкой, содержащей указанный текст
   * @param userId ID пользователя
   * @param buttonText Текст кнопки
   * @returns true, если найдена инлайн-кнопка с указанным текстом
   */
  hasInlineButton(userId: number, buttonText: string): boolean {
    const messages = this.getSentMessages(userId)

    return messages.some(msg => {
      const keyboard = msg.extra?.reply_markup?.inline_keyboard
      if (!keyboard) return false

      return keyboard.some((row: any[]) =>
        row.some((button: any) => button.text === buttonText)
      )
    })
  }

  /**
   * Симулирует нажатие на инлайн-кнопку
   * @param userId ID пользователя
   * @param buttonText Текст кнопки для поиска
   * @param callbackData Данные callback (если не указаны, используется текст кнопки)
   * @returns Контекст пользователя после нажатия кнопки
   */
  async simulateInlineButtonClick(
    userId: number,
    buttonText: string,
    callbackData?: string
  ): Promise<MyContext> {
    const context = this.getUserContext(userId)
    const messages = this.getSentMessages(userId)

    // Находим сообщение с нужной кнопкой
    for (const msg of messages) {
      const keyboard = msg.extra?.reply_markup?.inline_keyboard
      if (!keyboard) continue

      let buttonFound = false
      let data = callbackData

      // Ищем кнопку в клавиатуре
      for (const row of keyboard) {
        for (const button of row) {
          if (button.text === buttonText) {
            // Если callbackData не указан, используем callback_data из кнопки
            if (!data && button.callback_data) {
              data = button.callback_data
            }
            buttonFound = true
            break
          }
        }
        if (buttonFound) break
      }

      if (buttonFound && data) {
        logger.info('👆 Симуляция нажатия на инлайн-кнопку', {
          description: 'Simulating inline button click',
          userId,
          buttonText,
          callbackData: data,
        })

        // Создаем объект callback_query для контекста
        context.callbackQuery = {
          id: `mock_${Date.now()}`,
          from: context.from!,
          chat_instance: `mock_chat_${userId}`,
          message: msg,
          data,
        }

        // Добавляем метод answerCbQuery
        context.answerCbQuery = async (text?: string) => {
          logger.info('✓ Ответ на callback query', {
            description: 'Answer to callback query',
            text,
          })
          return true
        }

        return context
      }
    }

    throw new Error(`Кнопка с текстом "${buttonText}" не найдена`)
  }

  /**
   * Очищает все сохраненные сообщения для указанного пользователя
   * @param userId ID пользователя
   */
  clearMessages(userId: number): void {
    const context = this.getUserContext(userId)
    ;(context as any).sentReplies = []

    logger.info('🧹 Очищены сообщения для пользователя', {
      description: 'Cleared messages for user',
      userId,
    })
  }

  /**
   * Проверяет, был ли пользователь переведен в указанную сцену
   * @param userId ID пользователя
   * @param sceneId ID сцены
   * @returns true, если пользователь находится в указанной сцене
   */
  isInScene(userId: number, sceneId: string): boolean {
    const context = this.getUserContext(userId)
    return context.session.__scenes.current === sceneId
  }
}
