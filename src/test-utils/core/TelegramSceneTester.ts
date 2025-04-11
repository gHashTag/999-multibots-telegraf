import { MyContext } from '@/interfaces/telegram-bot.interface'
import { createMockContext } from '../helpers/createMockContext'
import { logger } from '@/utils/logger'
import { WizardScene } from 'telegraf/scenes'

/**
 * Базовый класс для тестирования Telegram сцен
 */
export class TelegramSceneTester {
  scene: WizardScene<MyContext>

  constructor(scene: WizardScene<MyContext>) {
    this.scene = scene
  }

  /**
   * Создает мок-контекст для тестирования
   * @param options Параметры для создания контекста
   * @returns Мок-контекст
   */
  createContext(
    options: Parameters<typeof createMockContext>[0] = {}
  ): ReturnType<typeof createMockContext> {
    return createMockContext(options)
  }

  /**
   * Запускает указанный шаг сцены
   * @param stepIndex Индекс шага
   * @param context Контекст для запуска
   */
  async runStep(stepIndex: number, context: MyContext): Promise<void> {
    if (!this.scene.steps || !this.scene.steps[stepIndex]) {
      throw new Error(
        `Шаг с индексом ${stepIndex} не найден в сцене ${this.scene.id}`
      )
    }

    const step = this.scene.steps[stepIndex]
    logger.info(`🎯 Запуск шага ${stepIndex} сцены ${this.scene.id}`, {
      description: `Running step ${stepIndex} of scene ${this.scene.id}`,
    })

    // Для безопасного вызова шага
    return (step as Function)(context)
  }

  /**
   * Проверяет отправленные сообщения в контексте
   * @param context Контекст, в котором проверяются сообщения
   * @param predicate Функция для проверки сообщения
   * @returns true, если найдено подходящее сообщение
   */
  hasMessageMatching(
    context: any,
    predicate: (message: any) => boolean
  ): boolean {
    const sentReplies = context.sentReplies || []
    return sentReplies.some(predicate)
  }

  /**
   * Проверяет наличие сообщения, содержащего указанный текст
   * @param context Контекст, в котором проверяются сообщения
   * @param text Текст, который должен содержаться в сообщении
   * @returns true, если найдено сообщение с указанным текстом
   */
  hasMessageWithText(context: any, text: string): boolean {
    return this.hasMessageMatching(
      context,
      message => message.text && message.text.includes(text)
    )
  }

  /**
   * Проверяет наличие сообщения с клавиатурой, содержащей кнопку с указанным текстом
   * @param context Контекст, в котором проверяются сообщения
   * @param buttonText Текст кнопки
   * @returns true, если найдена кнопка с указанным текстом
   */
  hasInlineButton(context: any, buttonText: string): boolean {
    return this.hasMessageMatching(context, message => {
      const keyboard = message.extra?.reply_markup?.inline_keyboard
      if (!keyboard) return false

      return keyboard.some((row: any[]) =>
        row.some((button: any) => button.text === buttonText)
      )
    })
  }

  /**
   * Проверяет наличие сообщения с URL кнопкой, содержащей указанный URL
   * @param context Контекст, в котором проверяются сообщения
   * @param urlFragment Фрагмент URL
   * @returns true, если найдена кнопка с URL, содержащим указанный фрагмент
   */
  hasUrlButton(context: any, urlFragment: string): boolean {
    return this.hasMessageMatching(context, message => {
      const keyboard = message.extra?.reply_markup?.inline_keyboard
      if (!keyboard) return false

      return keyboard.some((row: any[]) =>
        row.some(
          (button: any) => button.url && button.url.includes(urlFragment)
        )
      )
    })
  }
}
