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

  constructor() {
    logger.info('🔧 [INNGEST PROVIDER] Initializing...')
    // Инициализируем конфигурации из .env
    this.initializeConfigs()
    logger.info('✅ [INNGEST PROVIDER] Initialized with instances', {
      instances: Array.from(this.configs.keys()),
    })
  }

  private initializeConfigs() {
    // BOT инстанс (наш основной сервер)
    const botEventKey = process.env.BOT_INNGEST_EVENT_KEY
    const botSigningKey = process.env.BOT_INNGEST_SIGNING_KEY
    const botBaseUrl = process.env.BOT_INNGEST_BASE_URL || 'https://three-head-dragon.shop/api/inngest'

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
      logger.warn('⚠️ [INNGEST PROVIDER] BOT instance missing BOT_INNGEST_EVENT_KEY')
    }

    // RENDER инстанс (render-server на Railway)
    const renderEventKey = process.env.RENDER_INNGEST_EVENT_KEY
    const renderSigningKey = process.env.RENDER_INNGEST_SIGNING_KEY
    const renderBaseUrl = process.env.RENDER_INNGEST_BASE_URL || 'https://render-v3-production.up.railway.app/api/inngest'

    if (renderEventKey) {
      // Создаем официальный Inngest client для RENDER
      // ⚠️ SDK читает environment variables при вызове send()
      const renderClient = new Inngest({
        name: 'render-server-client',
        eventKey: renderEventKey,
        inngestBaseUrl: renderBaseUrl,
      })

      this.configs.set('RENDER', {
        eventKey: renderEventKey,
        signingKey: renderSigningKey,
        baseUrl: renderBaseUrl,
        name: 'render-server',
        client: renderClient, // ✅ Добавляем SDK client
      })
      logger.info('✅ [INNGEST PROVIDER] RENDER instance configured with SDK client', {
        baseUrl: renderBaseUrl,
        hasSigningKey: !!renderSigningKey,
        hasClient: true,
      })
    } else {
      logger.warn('⚠️ [INNGEST PROVIDER] RENDER instance missing RENDER_INNGEST_EVENT_KEY')
    }
  }

  /**
   * Получить конфигурацию для указанного инстанса
   */
  getConfig(instance: InngestInstance): InngestConfig | null {
    const config = this.configs.get(instance)

    if (!config) {
      logger.error('❌ [INNGEST PROVIDER] Instance not configured', { instance })
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
    const config = this.getConfig(instance)

    if (!config) {
      throw new Error(`Inngest instance "${instance}" not configured`)
    }

    if (!config.client) {
      throw new Error(`Inngest client not initialized for instance "${instance}"`)
    }

    logger.info(`📤 [INNGEST PROVIDER] Sending event to ${instance} via SDK`, {
      eventName,
      instance,
      baseUrl: config.baseUrl,
      hasClient: !!config.client,
    })

    try {
      logger.info(`📦 [INNGEST PROVIDER] Event payload`, {
        eventName,
        instance,
        payloadKeys: Object.keys(data),
        dataSize: JSON.stringify(data).length,
      })

      // ✅ SDK читает env vars для создания запроса к self-hosted серверу
      // Временно устанавливаем все необходимые env vars для RENDER
      const originalSigningKey = process.env.INNGEST_SIGNING_KEY
      const originalBaseUrl = process.env.INNGEST_BASE_URL
      const originalEventKey = process.env.INNGEST_EVENT_KEY

      if (instance === 'RENDER') {
        // ⚠️ КРИТИЧНО: SDK отправляет события на URL из INNGEST_BASE_URL!
        process.env.INNGEST_BASE_URL = config.baseUrl
        process.env.INNGEST_SIGNING_KEY = config.signingKey
        process.env.INNGEST_EVENT_KEY = config.eventKey

        logger.info(`🔑 [INNGEST PROVIDER] Set environment for ${instance}`, {
          baseUrl: config.baseUrl,
          eventKeyPrefix: config.eventKey.substring(0, 20) + '...',
          signingKeyPrefix: config.signingKey ? config.signingKey.substring(0, 20) + '...' : 'none',
        })
      }

      try {
        // ✅ SDK теперь отправит событие на Railway вместо Inngest Cloud!
        await config.client.send({
          name: eventName,
          data,
        })

        logger.info(`✅ [INNGEST PROVIDER] Event sent to ${instance} via SDK`, {
          eventName,
        })
      } finally {
        // Восстанавливаем оригинальные env vars
        if (instance === 'RENDER') {
          if (originalBaseUrl) process.env.INNGEST_BASE_URL = originalBaseUrl
          else delete process.env.INNGEST_BASE_URL
          if (originalSigningKey) process.env.INNGEST_SIGNING_KEY = originalSigningKey
          else delete process.env.INNGEST_SIGNING_KEY
          if (originalEventKey) process.env.INNGEST_EVENT_KEY = originalEventKey
          else delete process.env.INNGEST_EVENT_KEY
        }
      }

      // SDK не возвращает event IDs, генерируем свой для логирования
      const generatedEventId = `${instance.toLowerCase()}-${Date.now()}`
      return {
        eventId: generatedEventId,
      }
    } catch (error) {
      logger.error(`❌ [INNGEST PROVIDER] Error sending event to ${instance}`, {
        error: error instanceof Error ? error.message : String(error),
        eventName,
      })
      throw error
    }
  }

  /**
   * Проверить доступность инстанса
   */
  async checkAvailability(instance: InngestInstance): Promise<boolean> {
    const config = this.getConfig(instance)

    if (!config || !config.baseUrl) {
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
  async getStatus(): Promise<Record<InngestInstance, { configured: boolean; available?: boolean }>> {
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
