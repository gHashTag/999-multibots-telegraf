import { MyContext } from '@/interfaces/telegram-bot.interface'

import { logger } from '@/utils/logger'
import { WizardScene } from 'telegraf/scenes'
import { Context, Scenes } from 'telegraf'
import { Update } from 'telegraf/typings/core/types/typegram'

export interface TestUser {
  id: number
  username: string
}

export interface TestSessionData extends Scenes.WizardSessionData {
  cursor: number
  email?: string
  selectedModel?: string
  prompt?: string
  selectedSize?: string
  selectedPayment?: {
    amount: number
    stars: number
    subscription: string
  }
  subscription?: string
  __scenes: Record<string, unknown>
}

export interface TestSession extends Scenes.WizardSession<TestSessionData> {
  state: TestSessionData
}

export interface TestContext extends Partial<Context<Update>> {
  session: TestSession
  scene?: Scenes.BaseScene<TestContext>
  wizard?: Scenes.WizardContextWizard<TestContext>
  attempts: number
  amount: number
  user: {
    id: number
    username: string
  }
}

export interface CreateMockContextParams {
  user: TestUser
  session?: Partial<TestSession>
  scene?: Scenes.SceneContextScene<TestContext, TestSessionData>
  wizard?: Scenes.WizardContextWizard<TestContext>
  attempts?: number
  amount?: number
}

/**
 * Базовый класс для тестирования Telegram сцен
 */
export class TelegramSceneTester {
  scene: WizardScene<TestContext>
  protected baseContext: Partial<TestContext>

  constructor(scene: WizardScene<TestContext>) {
    this.scene = scene
    this.baseContext = {
      scene: {} as Scenes.SceneContextScene<TestContext, TestSessionData>,
      wizard: {} as Scenes.WizardContextWizard<TestContext>,
      attempts: 0,
      amount: 0,
      session: {
        cursor: 0,
        state: {
          cursor: 0,
          __scenes: {},
        },
      } as TestSession,
    }
  }

  /**
   * Создает мок-контекст для тестирования
   * @param params Параметры для создания контекста
   * @returns Мок-контекст
   */
  createContext(params: CreateMockContextParams): TestContext {
    const defaultParams = {
      session: {
        cursor: 0,
        state: {
          cursor: 0,
          __scenes: {},
        },
      } as TestSession,
      scene: {} as Scenes.SceneContextScene<TestContext, TestSessionData>,
      wizard: {} as Scenes.WizardContextWizard<TestContext>,
      attempts: 0,
      amount: 0,
      user: params.user,
    }

    return {
      ...this.baseContext,
      ...defaultParams,
      ...params,
    } as TestContext
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
    context: TestContext,
    predicate: (message: any) => boolean
  ): boolean {
    const sentReplies = (context as any).sentReplies || []
    return sentReplies.some(predicate)
  }

  /**
   * Проверяет наличие сообщения, содержащего указанный текст
   * @param context Контекст, в котором проверяются сообщения
   * @param text Текст, который должен содержаться в сообщении
   * @returns true, если найдено сообщение с указанным текстом
   */
  hasMessageWithText(context: TestContext, text: string): boolean {
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
  hasInlineButton(context: TestContext, buttonText: string): boolean {
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
  hasUrlButton(context: TestContext, urlFragment: string): boolean {
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
