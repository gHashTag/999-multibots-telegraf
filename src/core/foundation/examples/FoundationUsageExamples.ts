/**
 * 📚 ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ ЖЕЛЕЗОБЕТОННОЙ СИСТЕМЫ
 * Показывает, как правильно использовать Foundation в реальных сценариях
 */

import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { configManager } from '../ConfigManager'
import { isRussianFromState, languageManager } from '../LanguageManager'
import { errorHandler, ErrorType } from '../ErrorHandler'
import { telegramApiFor, telegramFileApiFor } from '@/services/telegramApi'
// import { menuActionHandler } from '../MenuActionHandler' // ❌ REMOVED: MenuActionHandler был удален

// ===============================
// ПРИМЕР 1: Создание нового сервиса
// ===============================

export class NewAIService {
  /**
   * Пример правильного создания нового AI сервиса
   */
  async generateContent(ctx: MyContext, prompt: string): Promise<void> {
    const telegramId = ctx.from?.id?.toString() || ''
    const isRu = isRussianFromState(ctx) // Быстрое определение языка

    try {
      // ✅ Правильное получение конфигурации
      const apiUrl = configManager.getApiServerUrl()
      const secretKey = configManager.get<string>('secretApiKey')

      // ✅ Правильное логирование
      const { logger } = await import('@/utils/logger')
      logger.info('AI service request started', {
        telegramId,
        promptLength: prompt.length,
        isRu,
      })

      // Имитация API вызова
      const response = await fetch(`${apiUrl}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Secret-Key': secretKey,
        },
        body: JSON.stringify({ prompt, telegramId }),
      })

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()

      // ✅ Успешный ответ пользователю
      await ctx.reply(
        isRu
          ? `✅ Контент сгенерирован: ${result.content}`
          : `✅ Content generated: ${result.content}`
      )
    } catch (error) {
      // ✅ Правильная обработка ошибок
      await errorHandler.handleError(error, ctx, ErrorType.API_INTEGRATION, {
        action: 'generate_content',
        data: { promptLength: prompt.length, telegramId },
      })
    }
  }
}

// ===============================
// ПРИМЕР 2: Добавление новой кнопки меню
// ===============================

export function registerNewMenuAction() {
  // ✅ Правильная регистрация нового действия меню
  // NOTE: MenuActionHandler был удален, используйте NavigationService для регистрации действий
  // Пример:
  // import { initializeNavigation } from '@/navigation'
  // initializeNavigation(bot) // Регистрация происходит автоматически
  console.log('MenuActionHandler removed - use NavigationService instead')
}

// ===============================
// ПРИМЕР 3: Обработка файлов с ошибками
// ===============================

export class FileProcessor {
  async processImage(ctx: MyContext, fileId: string): Promise<void> {
    const telegramId = ctx.from?.id?.toString() || ''

    try {
      // ✅ Получение файла через Telegram API
      const fileInfo = await ctx.telegram.getFile(fileId)

      if (!fileInfo.file_path) {
        throw new Error('File path not available')
      }

      // ✅ Загрузка файла
      const fileUrl = `${telegramFileApiFor(ctx.telegram.token)}/${fileInfo.file_path}`
      const response = await fetch(fileUrl)

      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status}`)
      }

      const buffer = await response.arrayBuffer()

      // ✅ Обработка файла
      await this.processImageBuffer(buffer, ctx)
    } catch (error) {
      // ✅ Специализированная обработка ошибок файлов
      await errorHandler.handleError(error, ctx, ErrorType.FILE_PROCESSING, {
        action: 'process_image',
        data: { fileId, telegramId },
      })
    }
  }

  private async processImageBuffer(
    buffer: ArrayBuffer,
    ctx: MyContext
  ): Promise<void> {
    // Логика обработки изображения
    const isRu = isRussianFromState(ctx)

    // Имитация обработки
    await new Promise(resolve => setTimeout(resolve, 2000))

    await ctx.reply(
      isRu
        ? '✅ Изображение обработано успешно!'
        : '✅ Image processed successfully!'
    )
  }
}

// ===============================
// ПРИМЕР 4: Работа с подпиской и балансом
// ===============================

export class SubscriptionService {
  /**
   * Пример проверки подписки с правильной обработкой ошибок
   */
  async checkAndProcessSubscription(
    ctx: MyContext,
    serviceName: string
  ): Promise<boolean> {
    const telegramId = ctx.from?.id?.toString() || ''

    try {
      // ✅ Получение данных пользователя
      const { getReferalsCountAndUserData } = await import('@/core/supabase')
      const userData = await getReferalsCountAndUserData(telegramId)

      if (!userData.subscriptionType || userData.subscriptionType === 'STARS') {
        // ✅ Правильное уведомление о необходимости подписки
        const languageData = await languageManager.getUserLanguage(ctx)

        const message = languageData.isRussian
          ? `💫 Для использования "${serviceName}" необходима подписка.\n\nНажмите "Оформить подписку" в главном меню.`
          : `💫 Subscription required to use "${serviceName}".\n\nPress "Subscribe" in the main menu.`

        await ctx.reply(message)

        // Переход к подписке
        if (ctx.scene.current) {
          await ctx.scene.leave()
        }
        await ctx.scene.enter(ModeEnum.SubscriptionScene)

        return false
      }

      return true
    } catch (error) {
      // ✅ Специализированная обработка ошибок подписки
      await errorHandler.handleError(error, ctx, ErrorType.SUBSCRIPTION, {
        action: 'check_subscription',
        data: { serviceName, telegramId },
      })

      return false
    }
  }
}

// ===============================
// ПРИМЕР 5: Создание новой сцены
// ===============================

import { Scenes } from 'telegraf'

export class NewFeatureScene extends Scenes.BaseScene<MyContext> {
  constructor() {
    super('new_feature_scene')

    // ✅ Правильная обработка входа в сцену
    this.enter(async ctx => {
      try {
        const languageData = await languageManager.getUserLanguage(ctx)

        const message = languageData.isRussian
          ? '🎨 Добро пожаловать в новую функцию!\n\nОтправьте текст для обработки:'
          : '🎨 Welcome to the new feature!\n\nSend text to process:'

        await ctx.reply(message, {
          reply_markup: {
            keyboard: [
              [languageData.isRussian ? '🏠 Главное меню' : '🏠 Main menu'],
              [languageData.isRussian ? 'Отмена' : 'Cancel'],
            ],
            resize_keyboard: true,
          },
        })
      } catch (error) {
        await errorHandler.handleSceneTransitionError(
          error,
          ctx,
          'new_feature_scene'
        )
      }
    })

    // ✅ Обработка текстовых сообщений в сцене
    this.on('text', async ctx => {
      try {
        const text = ctx.message.text

        // Проверка на команды выхода
        if (
          ['🏠 Главное меню', '🏠 Main menu', 'Отмена', 'Cancel'].includes(text)
        ) {
          await ctx.scene.leave()
          await ctx.scene.leave()
          const { showMainMenu } = await import('@/navigation')
          await showMainMenu(ctx)
          return
        }

        // Обработка пользовательского ввода
        await this.processUserInput(ctx, text)
      } catch (error) {
        await errorHandler.handleError(error, ctx, ErrorType.VALIDATION, {
          action: 'process_scene_input',
          data: { sceneId: 'new_feature_scene' },
        })
      }
    })
  }

  private async processUserInput(ctx: MyContext, text: string): Promise<void> {
    const isRu = isRussianFromState(ctx)

    // Показываем прогресс
    const progressMessage = await ctx.reply(
      isRu ? '⏳ Обрабатываем ваш запрос...' : '⏳ Processing your request...'
    )

    try {
      // Имитация обработки
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Успешный результат
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        progressMessage.message_id,
        undefined,
        isRu
          ? `✅ Готово! Обработан текст: "${text.substring(0, 50)}..."`
          : `✅ Done! Processed text: "${text.substring(0, 50)}..."`
      )

      // Предложение дальнейших действий
      await ctx.reply(
        isRu
          ? 'Что дальше?\n\n💬 Отправьте еще текст или вернитесь в главное меню'
          : 'What next?\n\n💬 Send more text or return to main menu'
      )
    } catch (error) {
      // Обновляем сообщение прогресса
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        progressMessage.message_id,
        undefined,
        isRu
          ? '❌ Произошла ошибка при обработке'
          : '❌ An error occurred during processing'
      )

      // Обрабатываем ошибку
      throw error
    }
  }
}

// ===============================
// ПРИМЕР 6: Health Check Endpoint
// ===============================

export class HealthCheckService {
  /**
   * Пример создания health check для мониторинга
   */
  static async getSystemHealth(): Promise<{
    status: 'healthy' | 'unhealthy'
    systems: Record<string, any>
    timestamp: string
  }> {
    try {
      // ✅ Используем built-in health check Foundation
      const { foundation } = await import('../Foundation')
      const health = await foundation.healthCheck()

      // ✅ Добавляем дополнительные проверки
      const additionalChecks = {
        database: await this.checkDatabase(),
        apiServer: await this.checkApiServer(),
        telegram: await this.checkTelegramAPI(),
      }

      return {
        ...health,
        systems: {
          ...health.systems,
          ...additionalChecks,
        },
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        systems: { error: 'Health check failed' },
        timestamp: new Date().toISOString(),
      }
    }
  }

  private static async checkDatabase(): Promise<'ok' | 'error'> {
    try {
      const { supabase } = await import('@/core/supabase/client')
      const { data, error } = await supabase.from('users').select('id').limit(1)
      return error ? 'error' : 'ok'
    } catch {
      return 'error'
    }
  }

  private static async checkApiServer(): Promise<'ok' | 'error'> {
    try {
      const apiUrl = configManager.getApiServerUrl()
      const response = await fetch(`${apiUrl}/health`, { method: 'GET' })
      return response.ok ? 'ok' : 'error'
    } catch {
      return 'error'
    }
  }

  private static async checkTelegramAPI(): Promise<'ok' | 'error'> {
    try {
      // Проверка через любой бот токен
      const botToken = configManager.get('botTokens')?.[0]
      if (!botToken) return 'error'

      const response = await fetch(`${telegramApiFor(botToken)}/getMe`)
      return response.ok ? 'ok' : 'error'
    } catch {
      return 'error'
    }
  }
}

// ===============================
// ПРИМЕР 7: Добавление middleware
// ===============================

export function createCustomMiddleware() {
  return async (ctx: MyContext, next: () => Promise<void>) => {
    const startTime = Date.now()
    const telegramId = ctx.from?.id?.toString()

    try {
      // ✅ Логирование входящего запроса
      const { logger } = await import('@/utils/logger')
      logger.debug('Custom middleware: processing update', {
        telegramId,
        updateType: ctx.updateType,
      })

      // ✅ Проверка инициализации Foundation
      const { foundation } = await import('../Foundation')
      if (!foundation.isInitialized()) {
        await ctx.reply('⚙️ Система инициализируется, попробуйте через минуту')
        return
      }

      // Продолжаем выполнение
      await next()
    } catch (error) {
      // ✅ Правильная обработка ошибок middleware
      await errorHandler.handleError(error, ctx, ErrorType.UNKNOWN, {
        action: 'custom_middleware',
        data: { telegramId, updateType: ctx.updateType },
      })
    } finally {
      // ✅ Логирование времени выполнения
      const duration = Date.now() - startTime
      const { logger } = await import('@/utils/logger')
      logger.debug('Custom middleware: update completed', {
        telegramId,
        duration: `${duration}ms`,
      })
    }
  }
}
