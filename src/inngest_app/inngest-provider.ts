/**
 * Inngest Provider - Менеджер для разных Inngest инстансов
 *
 * Управляет несколькими Inngest endpoint'ами:
 * - BOT: основной бот (наш сервер)
 * - RENDER: render-server на Railway
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
    if (!this.initialized) {
      logger.info('🔧 [INNGEST PROVIDER] Lazy initialization starting...')
      this.initializeConfigs()
      this.initialized = true
      logger.info('✅ [INNGEST PROVIDER] Lazy initialization completed', {
        instances: Array.from(this.configs.keys()),
      })
    }
  }

  private initializeConfigs() {
    // BOT инстанс (наш основной сервер)
    const botEventKey = process.env.BOT_INNGEST_EVENT_KEY
    const botSigningKey = process.env.BOT_INNGEST_SIGNING_KEY
    const botBaseUrl =
      process.env.BOT_INNGEST_BASE_URL ||
      'https://three-head-dragon.shop/api/inngest'

    if (botEventKey) {
      this.configs.set('BOT', {
        eventKey: botEventKey,
        signingKey: botSigningKey,
        baseUrl: botBaseUrl,
        name: 'telegram-bot-main',
      })
      logger.info('✅ [INNGEST PROVIDER] BOT instance configured', {
        baseUrl: botBaseUrl,
        hasSigningKey: !!botSigningKey,
      })
    } else {
      logger.warn(
        '⚠️ [INNGEST PROVIDER] BOT instance missing BOT_INNGEST_EVENT_KEY'
      )
    }

    // RENDER инстанс (Inngest Cloud → Railway render-server)
    const renderEventKey = process.env.RENDER_INNGEST_EVENT_KEY
    const renderSigningKey = process.env.RENDER_INNGEST_SIGNING_KEY

    if (renderEventKey) {
      // Создаем Inngest client для отправки в Inngest Cloud
      // Inngest Cloud вызовет Railway render-server function
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
        '✅ [INNGEST PROVIDER] RENDER instance configured (Inngest Cloud → Railway)',
        {
          cloudUrl: 'https://inn.gs',
          hasEventKey: !!renderEventKey,
          hasClient: true,
        }
      )
    } else {
      logger.warn(
        '⚠️ [INNGEST PROVIDER] RENDER instance missing RENDER_INNGEST_EVENT_KEY'
      )
    }
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
   * Использует официальный Inngest SDK
   */
  async sendEvent(
    instance: InngestInstance,
    eventName: string,
    data: any
  ): Promise<{ eventId: string } | null> {
    logger.info(`🔴 [INNGEST PROVIDER] sendEvent() called`, {
      instance,
      eventName,
      timestamp: Date.now(),
    })

    this.ensureInitialized()

    logger.info(`🔴 [INNGEST PROVIDER] ensureInitialized() completed`, {
      instance,
      hasConfigs: this.configs.size,
      initialized: this.initialized,
    })

    const config = this.getConfig(instance)

    logger.info(`🔴 [INNGEST PROVIDER] getConfig() result`, {
      instance,
      hasConfig: !!config,
      configKeys: config ? Object.keys(config) : [],
    })

    if (!config) {
      logger.error(`❌ [INNGEST PROVIDER] Inngest instance "${instance}" not configured`)
      throw new Error(`Inngest instance "${instance}" not configured`)
    }

    if (!config.client) {
      logger.error(`❌ [INNGEST PROVIDER] Inngest client not initialized for instance "${instance}"`)
      logger.error(`🔴 [INNGEST PROVIDER] Config details`, {
        instance,
        hasEventKey: !!config.eventKey,
        hasSigningKey: !!config.signingKey,
        hasBaseUrl: !!config.baseUrl,
        hasClient: !!config.client,
      })
      throw new Error(
        `Inngest client not initialized for instance "${instance}"`
      )
    }

    logger.info(`📤 [INNGEST PROVIDER] Sending event to ${instance} via SDK`, {
      eventName,
      instance,
      baseUrl: config.baseUrl,
      hasClient: !!config.client,
      eventKeyPrefix: config.eventKey?.substring(0, 10),
    })

    try {
      logger.info(`📦 [INNGEST PROVIDER] Event payload`, {
        eventName,
        instance,
        payloadKeys: Object.keys(data),
        dataSize: JSON.stringify(data).length,
      })

      logger.info(`🔴 [INNGEST PROVIDER] About to call config.client.send()`)

      // ✅ Отправляем событие в Inngest Cloud
      // Inngest Cloud вызовет функцию на Railway render-server
      await config.client.send({
        name: eventName,
        data,
      })

      logger.info(
        `✅ [INNGEST PROVIDER] Event sent to ${instance} (via Inngest Cloud)`,
        {
          eventName,
          cloudUrl: instance === 'RENDER' ? 'https://inn.gs' : config.baseUrl,
        }
      )

      // SDK не возвращает event IDs, генерируем свой для логирования
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
