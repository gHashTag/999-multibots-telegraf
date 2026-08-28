// @ts-nocheck
/**
 * Inngest Provider - Централизованный менеджер Inngest
 *
 * Управляет несколькими Inngest endpoint'ами:
 * - BOT: основной бот (наш сервер)
 * - RENDER: render-server на Railway
 */

import { logger } from '@/utils/logger'
// ✅ Используем единый клиент из @/inngest_app/client
import { inngest } from './client'

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
    const botEventKey = process.env.INNGEST_EVENT_KEY
    const botSigningKey = process.env.INNGEST_SIGNING_KEY
    // ВАЖНО: это значение НЕ влияет на доставку событий. Оно попадает только
    // в логи.
    //
    // Проверено по коду: botClient создаётся как new Inngest({ name, eventKey })
    // — baseUrl туда не передаётся. Поле baseUrl кладётся в this.configs и
    // встречается дальше лишь в трёх logger-вызовах (строки ~173, ~184, ~210).
    // Отправка идёт через config.client.send(). Общий клиент в client.ts тоже
    // создаётся без baseUrl, поэтому SDK берёт свой умолчательный адрес:
    // node_modules/inngest/helpers/consts.js:180 — defaultInngestEventBaseUrl =
    // "https://inn.gs/". Сам SDK читает INNGEST_BASE_URL из окружения
    // напрямую (envKeys.InngestBaseUrl), а в проде она не задана.
    //
    // Вывод: события уходят в Inngest Cloud, и мёртвый three-head-dragon.shop
    // никогда на это не влиял. В PR #422 я написал обратное — что baseUrl
    // используется клиентом и правка «не декоративна». Это было неверно.
    // BOT_INNGEST_BASE_URL в цепочке оставлен: пусть в логах стоит живой хост,
    // а не адрес сервера, которого нет.
    const botBaseUrl =
      process.env.INNGEST_BASE_URL || process.env.BOT_INNGEST_BASE_URL || ''

    if (botEventKey) {
      // Создаем Inngest client для отправки событий
      const botClient = new Inngest({
        name: 'telegram-bot-main',
        eventKey: botEventKey,
        // События отправляются в Inngest Cloud, который вызывает наши локальные функции
      })

      this.configs.set('BOT', {
        eventKey: botEventKey,
        signingKey: botSigningKey,
        baseUrl: botBaseUrl,
        name: 'telegram-bot-main',
        client: botClient,
      })
      logger.info(
        '✅ [INNGEST PROVIDER] BOT instance configured (использует единый клиент)',
        {
          baseUrl: botBaseUrl,
          hasSigningKey: !!botSigningKey,
          usesUnifiedClient: true,
        }
      )
    } else {
      logger.warn(
        '⚠️ [INNGEST PROVIDER] BOT instance missing INNGEST_EVENT_KEY'
      )
    }

    // RENDER инстанс (Inngest Cloud → Railway render-server)
    // ✅ Используем единый клиент из client.ts
    const renderEventKey = process.env.RENDER_INNGEST_EVENT_KEY
    const renderSigningKey = process.env.RENDER_INNGEST_SIGNING_KEY

    if (renderEventKey) {
      // ✅ Используем единый клиент для RENDER тоже
      this.configs.set('RENDER', {
        eventKey: renderEventKey,
        signingKey: renderSigningKey,
        baseUrl: 'https://inn.gs', // Inngest Cloud
        name: 'render-server',
        client: inngest, // ✅ Единый клиент
      })
      logger.info(
        '✅ [INNGEST PROVIDER] RENDER instance configured (использует единый клиент)',
        {
          cloudUrl: 'https://inn.gs',
          hasEventKey: !!renderEventKey,
          usesUnifiedClient: true,
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
      logger.error(
        `❌ [INNGEST PROVIDER] Inngest instance "${instance}" not configured`
      )
      throw new Error(`Inngest instance "${instance}" not configured`)
    }

    if (!config.client) {
      logger.error(
        `❌ [INNGEST PROVIDER] Inngest client not initialized for instance "${instance}"`
      )
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

    // Проверяем наличие client и eventKey
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
