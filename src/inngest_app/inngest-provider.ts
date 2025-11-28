/**
 * Inngest Provider - Менеджер для разных Inngest инстансов
 *
 * Управляет несколькими Inngest endpoint'ами:
 * - BOT: основной бот (наш сервер)
 * - RENDER: render-server на Render Server
 */

import { logger } from '@/utils/logger'
import { Inngest } from 'inngest'

export type InngestInstance = 'BOT' | 'RENDER'

interface InngestConfig {
  eventKey: string
  signingKey?: string
  baseUrl?: string
  name: string
  client?: Inngest // Официальный Inngest client
}

class InngestProvider {
  private configs: Map<InngestInstance, InngestConfig> = new Map()
  private initialized = false

  constructor() {
    logger.info('🔧 [INNGEST PROVIDER] Initializing...')
    // Ленивая инициализация - конфигурации будут загружены при первом использовании
    logger.info('⏳ [INNGEST PROVIDER] Lazy initialization enabled')
  }

  private ensureInitialized() {
    // ✅ ФИКС: Всегда переинициализируем конфигурацию для получения свежих значений из process.env
    // Это критично для случаев, когда секреты загружаются динамически (например, из Infisical)
    logger.info(
      '🔧 [INNGEST PROVIDER] (Re)initializing configuration from process.env...'
    )
    this.initializeConfigs()
    this.initialized = true
    logger.info('✅ [INNGEST PROVIDER] Configuration refreshed', {
      instances: Array.from(this.configs.keys()),
    })
  }

  private initializeConfigs() {
    logger.info(
      '🔍 [INNGEST PROVIDER] Starting configuration initialization...'
    )

    // BOT инстанс (наш основной сервер)
    // ✅ Используем RENDER_INNGEST_EVENT_KEY потому что BOT_INNGEST_EVENT_KEY пустой
    const botEventKey =
      process.env.RENDER_INNGEST_EVENT_KEY || process.env.BOT_INNGEST_EVENT_KEY
    const botSigningKey = process.env.BOT_INNGEST_SIGNING_KEY
    const botBaseUrl =
      process.env.BOT_INNGEST_BASE_URL ||
      'https://three-head-dragon.shop/api/inngest'

    logger.info('🔍 [INNGEST PROVIDER] BOT instance check:', {
      hasBotEventKey: !!botEventKey,
      botEventKeyLength: botEventKey?.length || 0,
      hasBotSigningKey: !!botSigningKey,
      botBaseUrl,
    })

    if (botEventKey) {
      // Создаем Inngest клиент для BOT instance (как для RENDER)
      logger.info('🔧 [INNGEST PROVIDER] Creating Inngest client for BOT...')

      const botClient = new Inngest({
        name: 'telegram-bot-client',
        eventKey: botEventKey,
        baseUrl: botBaseUrl,
        isDev: false,
      })

      this.configs.set('BOT', {
        eventKey: botEventKey,
        signingKey: botSigningKey,
        baseUrl: botBaseUrl,
        name: 'telegram-bot-main',
        client: botClient,
      })

      logger.info('✅ [INNGEST PROVIDER] BOT instance configured', {
        baseUrl: botBaseUrl,
        hasSigningKey: !!botSigningKey,
        eventKeyPreview: `${botEventKey.substring(0, 20)}...`,
        hasClient: true,
        eventKeyValid: botEventKey.length > 50,
        signingKeyValid: botSigningKey?.startsWith('signkey-'),
      })
    } else {
      logger.warn('⚠️ [INNGEST PROVIDER] BOT instance missing event key')
    }

    // RENDER инстанс (Inngest Cloud → Render Server)
    const renderEventKey = process.env.RENDER_INNGEST_EVENT_KEY
    const renderSigningKey = process.env.RENDER_INNGEST_SIGNING_KEY
    const renderBaseUrl =
      process.env.RENDER_INNGEST_BASE_URL ||
      'https://render-v3-production.up.railway.app/api/inngest'

    logger.info('🔍 [INNGEST PROVIDER] RENDER instance check:', {
      hasRenderEventKey: !!renderEventKey,
      renderEventKeyLength: renderEventKey?.length || 0,
      renderEventKeyPreview: renderEventKey
        ? `${renderEventKey.substring(0, 30)}...`
        : 'НЕТ',
      hasRenderSigningKey: !!renderSigningKey,
      renderSigningKeyLength: renderSigningKey?.length || 0,
      renderSigningKeyPreview: renderSigningKey
        ? `${renderSigningKey.substring(0, 30)}...`
        : 'НЕТ',
      renderBaseUrl,
    })

    if (renderEventKey) {
      // Создаем Inngest client для отправки в Inngest Cloud
      // Inngest Cloud вызовет Render Server function
      logger.info('🔧 [INNGEST PROVIDER] Creating Inngest client for RENDER...')

      const renderClient = new Inngest({
        name: 'render-server-client',
        eventKey: renderEventKey,
        // НЕ устанавливаем inngestBaseUrl - по умолчанию Inngest Cloud (inn.gs)
      })

      this.configs.set('RENDER', {
        eventKey: renderEventKey,
        signingKey: renderSigningKey,
        baseUrl: 'https://inn.gs', // Inngest Cloud
        name: 'render-server',
        client: renderClient,
      })

      logger.info(
        '✅ [INNGEST PROVIDER] RENDER instance configured (Inngest Cloud → Render Server)',
        {
          cloudUrl: 'https://inn.gs',
          hasEventKey: !!renderEventKey,
          eventKeyValid: renderEventKey.length > 50,
          hasSigningKey: !!renderSigningKey,
          signingKeyValid: renderSigningKey?.startsWith('signkey-'),
          hasClient: true,
          renderServerUrl: renderBaseUrl,
        }
      )

      // 🔴 КРИТИЧЕСКАЯ ПРОВЕРКА ФОРМАТА КЛЮЧЕЙ
      if (renderEventKey.length < 50) {
        logger.error(
          '❌ [INNGEST PROVIDER] RENDER_INNGEST_EVENT_KEY слишком короткий!',
          {
            length: renderEventKey.length,
            expected: '> 50 символов',
          }
        )
      }

      if (renderSigningKey && !renderSigningKey.startsWith('signkey-')) {
        logger.error(
          '❌ [INNGEST PROVIDER] RENDER_INNGEST_SIGNING_KEY имеет неверный формат!',
          {
            preview: renderSigningKey.substring(0, 20),
            expected: 'signkey-...',
          }
        )
      }
    } else {
      logger.error(
        '❌ [INNGEST PROVIDER] RENDER instance ОТСУТСТВУЕТ RENDER_INNGEST_EVENT_KEY!'
      )
      logger.error(
        '   HeyGen wizard и render-server запросы НЕ БУДУТ РАБОТАТЬ!'
      )
      logger.error('   Проверьте переменные окружения:')
      logger.error('   - RENDER_INNGEST_EVENT_KEY')
      logger.error('   - RENDER_INNGEST_SIGNING_KEY')
      logger.error('   - RENDER_INNGEST_BASE_URL')
    }

    logger.info('🔍 [INNGEST PROVIDER] Configuration summary:', {
      totalConfigs: this.configs.size,
      hasBOT: this.configs.has('BOT'),
      hasRENDER: this.configs.has('RENDER'),
    })
  }

  /**
   * Получить конфигурацию для указанного инстанса
   */
  getConfig(instance: InngestInstance): InngestConfig | null {
    this.ensureInitialized()
    const config = this.configs.get(instance)

    if (!config) {
      logger.error('❌ [INNGEST PROVIDER] Instance not configured', {
        instance,
      })
      return null
    }

    return config
  }

  /**
   * Отправить событие в указанный Inngest инстанс
   * Использует Inngest SDK client.send()
   */
  async sendEvent(
    instance: InngestInstance,
    eventName: string,
    data: any
  ): Promise<{ eventId: string } | null> {
    logger.info(`📤 [INNGEST PROVIDER] sendEvent() called`, {
      instance,
      eventName,
    })

    this.ensureInitialized()

    const config = this.getConfig(instance)

    if (!config) {
      logger.error(
        `❌ [INNGEST PROVIDER] Inngest instance "${instance}" not configured`
      )
      throw new Error(`Inngest instance "${instance}" not configured`)
    }

    if (!config.client) {
      logger.error(
        `❌ [INNGEST PROVIDER] Inngest client not initialized for instance "${instance}"`
      )
      throw new Error(
        `Inngest client not initialized for instance "${instance}"`
      )
    }

    logger.info(`📤 [INNGEST PROVIDER] Sending event via Inngest SDK`, {
      eventName,
      instance,
      eventKeyPrefix: config.eventKey?.substring(0, 10),
    })

    try {
      // ✅ Отправляем событие в Inngest Cloud через SDK
      // SDK сам формирует правильный запрос к https://inn.gs
      await config.client.send({
        name: eventName,
        data,
      })

      logger.info(
        `✅ [INNGEST PROVIDER] Event sent to ${instance} (via Inngest Cloud)`,
        {
          eventName,
        }
      )

      const generatedEventId = `${instance.toLowerCase()}-${Date.now()}`
      return {
        eventId: generatedEventId,
      }
    } catch (error) {
      logger.error(`❌ [INNGEST PROVIDER] Error sending event to ${instance}`, {
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        eventName,
      })
      throw error
    }
  }

  /**
   * Проверить доступность инстанса
   */
  async checkAvailability(instance: InngestInstance): Promise<boolean> {
    this.ensureInitialized()
    const config = this.getConfig(instance)

    if (!config) {
      return false
    }

    // Для RENDER instance проверяем наличие client и eventKey
    // (это функция в Inngest Cloud, нельзя проверить через HTTP GET)
    if (instance === 'RENDER') {
      const isAvailable = !!(config.client && config.eventKey)
      if (isAvailable) {
        logger.info(
          `✅ [INNGEST PROVIDER] ${instance} available (Inngest Cloud client configured)`,
          {
            hasClient: !!config.client,
            hasEventKey: !!config.eventKey,
          }
        )
      } else {
        logger.warn(`⚠️ [INNGEST PROVIDER] ${instance} not available`, {
          hasClient: !!config.client,
          hasEventKey: !!config.eventKey,
        })
      }
      return isAvailable
    }

    // Для BOT instance проверяем через HTTP запрос к нашему серверу
    if (!config.baseUrl) {
      return false
    }

    try {
      const response = await fetch(config.baseUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const data = await response.json()
        logger.info(`✅ [INNGEST PROVIDER] ${instance} available`, {
          functions: data.functions?.length || 0,
        })
        return true
      }

      logger.warn(`⚠️ [INNGEST PROVIDER] ${instance} responded but not OK`, {
        status: response.status,
      })
      return false
    } catch (error) {
      logger.error(`❌ [INNGEST PROVIDER] ${instance} not available`, {
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  /**
   * Принудительная переинициализация после загрузки секретов
   * Вызывается из index.ts после загрузки секретов из Infisical
   */
  forceReinitialize(): void {
    logger.info('🔄 [INNGEST PROVIDER] Force reinitialization requested')
    this.initialized = false
    this.configs.clear()
    this.ensureInitialized()
    logger.info('✅ [INNGEST PROVIDER] Force reinitialization completed')
  }

  /**
   * Получить список доступных инстансов
   */
  getAvailableInstances(): InngestInstance[] {
    return Array.from(this.configs.keys())
  }

  /**
   * Получить статус всех инстансов
   */
  async getStatus(): Promise<
    Record<InngestInstance, { configured: boolean; available?: boolean }>
  > {
    const instances = this.getAvailableInstances()
    const status: any = {}

    for (const instance of instances) {
      const config = this.getConfig(instance)
      status[instance] = {
        configured: !!config,
        available: config ? await this.checkAvailability(instance) : false,
      }
    }

    return status
  }
}

// Singleton instance
export const inngestProvider = new InngestProvider()
