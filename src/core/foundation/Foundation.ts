/**
 * 🏗️ ЖЕЛЕЗОБЕТОННАЯ ОСНОВА (FOUNDATION)
 * Централизованная инициализация всех основных систем
 * Гарантирует правильный порядок загрузки и устраняет race conditions
 */

import { Telegraf } from 'telegraf'
import { MyContext, MySession } from '@/interfaces'
import { configManager } from './ConfigManager'
import { menuSystem } from './MenuSystem'
import { languageManager } from './LanguageManager'
import { errorHandler, ErrorType } from './ErrorHandler'
import { logger } from '@/utils/logger'

export interface FoundationConfig {
  enableErrorHandling?: boolean
  enableMenuSystem?: boolean
  enableLanguageManager?: boolean
  logLevel?: 'debug' | 'info' | 'warn' | 'error'
}

export class Foundation {
  private static instance: Foundation
  private initialized = false
  private config: FoundationConfig = {}

  private constructor() {}

  public static getInstance(): Foundation {
    if (!Foundation.instance) {
      Foundation.instance = new Foundation()
    }
    return Foundation.instance
  }

  /**
   * ГЛАВНАЯ ФУНКЦИЯ: Инициализация всей системы
   * Вызывается ОДИН РАЗ при старте бота
   */
  public async initialize(
    bot: Telegraf<MyContext>,
    config: FoundationConfig = {}
  ): Promise<void> {
    if (this.initialized) {
      logger.warn('Foundation already initialized')
      return
    }

    this.config = {
      enableErrorHandling: true,
      enableMenuSystem: true,
      enableLanguageManager: true,
      logLevel: 'info',
      ...config,
    }

    logger.info('Foundation initialization started', { config: this.config })

    try {
      // 1. ПЕРВЫЙ: Конфигурационный менеджер (все зависит от него)
      await this.initializeConfigManager()

      // 2. ВТОРОЙ: Система языков (нужна для ошибок и меню)
      if (this.config.enableLanguageManager) {
        await this.initializeLanguageManager()
      }

      // 3. ТРЕТИЙ: Система обработки ошибок (нужна для всего)
      if (this.config.enableErrorHandling) {
        await this.initializeErrorHandling(bot)
      }

      // 4. ЧЕТВЕРТЫЙ: Система меню (последняя, так как использует все предыдущие)
      if (this.config.enableMenuSystem) {
        await this.initializeMenuSystem(bot)
      }

      // 5. Настройка глобальных middleware
      this.setupGlobalMiddleware(bot)

      this.initialized = true
      logger.info('Foundation initialization completed successfully')
    } catch (error) {
      logger.error('Foundation initialization failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      throw new Error(`Foundation initialization failed: ${error}`)
    }
  }

  /**
   * Инициализация конфигурационного менеджера
   */
  private async initializeConfigManager(): Promise<void> {
    logger.info('Initializing ConfigManager...')
    await configManager.initialize()
    logger.info('ConfigManager initialized successfully')
  }

  /**
   * Инициализация системы языков
   */
  private async initializeLanguageManager(): Promise<void> {
    logger.info('Initializing LanguageManager...')
    // LanguageManager не требует специальной инициализации, это singleton
    logger.info('LanguageManager initialized successfully')
  }

  /**
   * Инициализация системы обработки ошибок
   */
  private async initializeErrorHandling(
    bot: Telegraf<MyContext>
  ): Promise<void> {
    logger.info('Initializing ErrorHandler...')

    // Глобальный перехватчик необработанных ошибок
    process.on('uncaughtException', error => {
      logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack,
      })
      errorHandler.handleError(error, null, ErrorType.UNKNOWN, {
        action: 'uncaughtException',
      })
    })

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', {
        reason: String(reason),
        promise: String(promise),
      })
      errorHandler.handleError(
        new Error(String(reason)),
        null,
        ErrorType.UNKNOWN,
        { action: 'unhandledRejection' }
      )
    })

    // Перехватчик ошибок бота
    bot.catch(async (err: any, ctx) => {
      logger.error('Bot error caught', {
        error: err instanceof Error ? err.message : String(err),
        telegramId: ctx.from?.id,
        updateType: ctx.updateType,
      })
      await errorHandler.handleError(err, ctx, ErrorType.UNKNOWN, {
        action: 'bot_error',
      })
    })

    logger.info('ErrorHandler initialized successfully')
  }

  /**
   * Инициализация системы меню
   */
  private async initializeMenuSystem(bot: Telegraf<MyContext>): Promise<void> {
    logger.info('Initializing MenuSystem...')
    await menuSystem.initialize(bot)
    logger.info('MenuSystem initialized successfully')
  }

  /**
   * Настройка глобальных middleware
   */
  private setupGlobalMiddleware(bot: Telegraf<MyContext>): void {
    logger.info('Setting up global middleware...')

    // Middleware для логирования входящих обновлений
    bot.use(async (ctx, next) => {
      const startTime = Date.now()
      const telegramId = ctx.from?.id
      const updateType = ctx.updateType

      logger.debug('Incoming update', {
        telegramId,
        updateType,
        messageText: 'text' in ctx.message! ? ctx.message.text : undefined,
      })

      try {
        await next()
      } catch (error) {
        await errorHandler.handleError(error, ctx, ErrorType.UNKNOWN, {
          action: 'middleware_error',
          data: { updateType },
        })
      } finally {
        const duration = Date.now() - startTime
        logger.debug('Update processed', {
          telegramId,
          updateType,
          duration: `${duration}ms`,
        })
      }
    })

    // Middleware для инициализации сессии
    bot.use(async (ctx, next) => {
      if (!ctx.session) {
        logger.warn('Session not initialized', { telegramId: ctx.from?.id })
        // Initialize with required properties
        ctx.session = {
          cursor: 0,
          mode: 'chat',
          images: [],
          targetUserId: null,
          userModel: {
            model_name: '',
            trigger_word: '',
            model_url: 'demo/v1:latest',
            baseModel: null,
            additionalModels: [],
          },
        } as MySession
      }
      await next()
    })

    // Middleware для проверки инициализации Foundation
    bot.use(async (ctx, next) => {
      if (!this.initialized) {
        logger.error('Foundation not initialized, rejecting update', {
          telegramId: ctx.from?.id,
          updateType: ctx.updateType,
        })
        await ctx.reply('🔧 Система инициализируется, попробуйте позже')
        return
      }
      await next()
    })

    logger.info('Global middleware configured successfully')
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    logger.info('Foundation shutdown initiated')

    try {
      // Очищаем кеши
      languageManager.clearCache()
      errorHandler.clearErrorStats()

      logger.info('Foundation shutdown completed')
    } catch (error) {
      logger.error('Error during Foundation shutdown', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Проверка статуса инициализации
   */
  public isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Получение статуса всех систем
   */
  public getSystemStatus(): {
    foundation: boolean
    configManager: boolean
    menuSystem: boolean
    errorHandler: boolean
  } {
    return {
      foundation: this.initialized,
      configManager: configManager.get !== undefined, // Простая проверка инициализации
      menuSystem: menuSystem.isInitialized(),
      errorHandler: true, // ErrorHandler всегда доступен
    }
  }

  /**
   * Получение конфигурации
   */
  public getConfig(): FoundationConfig {
    return { ...this.config }
  }

  /**
   * Health check для мониторинга
   */
  public async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy'
    systems: Record<string, 'ok' | 'error'>
    timestamp: string
  }> {
    const systems: Record<string, 'ok' | 'error'> = {}
    let overallStatus: 'healthy' | 'unhealthy' = 'healthy'

    try {
      // Проверяем ConfigManager
      systems.configManager =
        configManager.get('isDev') !== undefined ? 'ok' : 'error'

      // Проверяем MenuSystem
      systems.menuSystem = menuSystem.isInitialized() ? 'ok' : 'error'

      // Проверяем LanguageManager
      systems.languageManager = languageManager.getCacheStats() ? 'ok' : 'error'

      // Проверяем ErrorHandler
      systems.errorHandler = errorHandler.getErrorStats() ? 'ok' : 'error'

      // Определяем общий статус
      if (Object.values(systems).includes('error')) {
        overallStatus = 'unhealthy'
      }
    } catch (error) {
      logger.error('Health check failed', { error })
      overallStatus = 'unhealthy'
    }

    return {
      status: overallStatus,
      systems,
      timestamp: new Date().toISOString(),
    }
  }
}

// Экспорт singleton экземпляра
export const foundation = Foundation.getInstance()

// Функция для быстрой инициализации (для совместимости)
export const initializeFoundation = async (
  bot: Telegraf<MyContext>,
  config?: FoundationConfig
) => {
  await foundation.initialize(bot, config)
}

// Проверки для использования в других модулях
export const isFoundationReady = () => foundation.isInitialized()
export const requireFoundation = () => {
  if (!foundation.isInitialized()) {
    throw new Error(
      'Foundation not initialized. Call initializeFoundation() first.'
    )
  }
}
