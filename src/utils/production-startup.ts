import {
  autoConfigureProductionWebhooks,
  validateWebhookSetup,
} from '../utils/webhook-manager'
import { botLogger } from '../utils/logger'

/**
 * Production startup configuration
 */
interface ProductionStartupConfig {
  webhookDomain: string
  webhookPath: string
  webhookProtocol?: 'http' | 'https'
  botPorts: Record<string, number>
  enableHealthCheck: boolean
  startupTimeout: number
}

/**
 * Bot instance metadata for startup
 */
interface BotInstanceMeta {
  bot: any // Telegraf instance
  name: string
  token: string
  port?: number
  username?: string
}

/**
 * Production startup manager for automatic deployment
 */
export class ProductionStartupManager {
  private config: ProductionStartupConfig
  private botInstances: BotInstanceMeta[] = []
  private webhookResults: any[] = []
  private startupTimer?: NodeJS.Timeout

  constructor(config: ProductionStartupConfig) {
    this.config = config
  }

  /**
   * Register a bot instance for automatic webhook setup
   */
  registerBot(
    bot: any,
    name: string,
    token: string,
    port?: number,
    username?: string
  ): void {
    this.botInstances.push({ bot, name, token, port, username })
    botLogger.info(
      'StartupManager',
      `📝 Registered bot: ${name} (${username || 'unknown'})`
    )
  }

  /**
   * Start the production environment with automatic webhook setup
   */
  async startProduction(): Promise<boolean> {
    try {
      botLogger.info('StartupManager', '🚀 Starting production deployment...')

      // Set startup timeout
      const timeoutPromise = new Promise<boolean>((_, reject) => {
        this.startupTimer = setTimeout(() => {
          reject(
            new Error(
              `Production startup timeout after ${this.config.startupTimeout}ms`
            )
          )
        }, this.config.startupTimeout)
      })

      // Start main process
      const startupPromise = this.executeStartup()

      const result = await Promise.race([startupPromise, timeoutPromise])

      if (this.startupTimer) {
        clearTimeout(this.startupTimer)
      }

      return result
    } catch (error) {
      botLogger.error(
        'StartupManager',
        `❌ Production startup failed: ${error}`
      )
      return false
    }
  }

  /**
   * Execute the main startup process
   */
  private async executeStartup(): Promise<boolean> {
    try {
      // Step 1: Validate environment
      if (!this.validateEnvironment()) {
        throw new Error('Environment validation failed')
      }

      // Step 2: Prepare bot instances
      await this.prepareBotInstances()

      // Step 3: Configure webhooks automatically
      await this.configureWebhooks()

      // Step 4: Start bot instances
      await this.startBotInstances()

      // Step 5: Health check (if enabled)
      if (this.config.enableHealthCheck) {
        await this.performHealthCheck()
      }

      // Step 6: Final validation
      await this.validateDeployment()

      botLogger.info(
        'StartupManager',
        '✅ Production deployment completed successfully!'
      )
      return true
    } catch (error) {
      botLogger.error('StartupManager', `💥 Production startup error: ${error}`)
      await this.rollbackOnFailure()
      return false
    }
  }

  /**
   * Validate production environment
   */
  private validateEnvironment(): boolean {
    const requiredEnvVars = ['NODE_ENV', 'WEBHOOK_DOMAIN', 'BOT_TOKEN_1']

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        botLogger.error(
          'StartupManager',
          `❌ Missing required environment variable: ${envVar}`
        )
        return false
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      botLogger.warn('StartupManager', '⚠️ NODE_ENV is not set to production')
    }

    /*
     * THE THREE VARIABLES ABOVE ARE ENOUGH TO COME UP, AND NOT ENOUGH TO
     * DELIVER ANYTHING.
     *
     * Owner: "clients want to pay and we cannot give them the service". The
     * check demanded NODE_ENV, WEBHOOK_DOMAIN and BOT_TOKEN_1 -- and not one
     * provider key. The bot reported a successful start, offered photos,
     * video and voice, walked the person to payment, and found out about the
     * missing key inside the handler: after the charge.
     *
     * The report is printed, and startup is NOT stopped. Some services are
     * switched off on purpose, and dying because of one provider would take
     * the bot away from everyone whose setup is fine. An unavailable PAID
     * service goes to error -- that is a sale that cannot happen, not a note.
     */
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { reportAtStartup } = require('@/services/capabilityPreflight')
      reportAtStartup()
    } catch (e: any) {
      botLogger.warn(
        'StartupManager',
        `preflight did not run: ${e?.message ?? e}`
      )
    }

    botLogger.info('StartupManager', '✅ Environment validation passed')
    return true
  }

  /**
   * Prepare bot instances for webhook mode
   */
  private async prepareBotInstances(): Promise<void> {
    botLogger.info(
      'StartupManager',
      `📦 Preparing ${this.botInstances.length} bot instances...`
    )

    for (const botMeta of this.botInstances) {
      try {
        // Get bot info
        const botInfo = await botMeta.bot.telegram.getMe()
        botMeta.username = botInfo.username

        // Clear any existing webhooks in development
        await botMeta.bot.telegram.deleteWebhook({ drop_pending_updates: true })

        botLogger.info(
          'StartupManager',
          `✅ Prepared bot: ${botMeta.name} (@${botMeta.username})`
        )
      } catch (error) {
        botLogger.error(
          'StartupManager',
          `❌ Failed to prepare bot ${botMeta.name}: ${error}`
        )
        throw error
      }
    }
  }

  /**
   * Configure webhooks for all bots
   */
  private async configureWebhooks(): Promise<void> {
    botLogger.info('StartupManager', '🔗 Configuring webhooks...')

    const webhookConfig = {
      domain: this.config.webhookDomain.replace(/^https?:\/\//, ''), // Remove protocol prefix
      path: this.config.webhookPath,
      port: 3000, // Default port for webhooks
      protocol: this.config.webhookProtocol,
      retryAttempts: 3,
      retryDelay: 2000,
    }

    const botsForWebhook = this.botInstances.map(meta => ({
      bot: meta.bot,
      name: meta.name,
      port: meta.port,
    }))

    this.webhookResults = await autoConfigureProductionWebhooks(
      botsForWebhook,
      webhookConfig
    )

    const successCount = this.webhookResults.filter(r => r.success).length
    const failureCount = this.webhookResults.length - successCount

    if (failureCount > 0) {
      botLogger.warn(
        'StartupManager',
        `⚠️ ${failureCount} webhook configurations failed`
      )
    } else {
      botLogger.info(
        'StartupManager',
        '✅ All webhooks configured successfully'
      )
    }
  }

  /**
   * Start bot instances in webhook mode
   */
  private async startBotInstances(): Promise<void> {
    botLogger.info('StartupManager', '🚀 Starting bot instances...')

    for (let i = 0; i < this.botInstances.length; i++) {
      const botMeta = this.botInstances[i]
      const webhookResult = this.webhookResults[i]

      if (!webhookResult?.success) {
        botLogger.warn(
          'StartupManager',
          `⚠️ Skipping bot ${botMeta.name} due to webhook failure`
        )
        continue
      }

      try {
        const port = botMeta.port || 3001 + i

        await botMeta.bot.launch({
          webhook: {
            domain: this.config.webhookDomain,
            port: port,
            hookPath: `/${botMeta.name}`,
          },
          allowedUpdates: ['message', 'callback_query', 'pre_checkout_query'],
        })

        botLogger.info(
          'StartupManager',
          `✅ Started bot: ${botMeta.name} on port ${port}`
        )
      } catch (error) {
        botLogger.error(
          'StartupManager',
          `❌ Failed to start bot ${botMeta.name}: ${error}`
        )
        throw error
      }
    }
  }

  /**
   * Perform health check on deployed bots
   */
  private async performHealthCheck(): Promise<void> {
    botLogger.info('StartupManager', '🔍 Performing health check...')

    const healthResults = await Promise.all(
      this.botInstances.map(async botMeta => {
        try {
          const validation = await validateWebhookSetup(
            botMeta.bot,
            botMeta.name
          )
          return { botName: botMeta.name, ...validation }
        } catch (error) {
          return {
            botName: botMeta.name,
            valid: false,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      })
    )

    const healthyBots = healthResults.filter(r => r.valid).length
    const totalBots = healthResults.length

    botLogger.info(
      'StartupManager',
      `📊 Health check: ${healthyBots}/${totalBots} bots healthy`
    )

    if (healthyBots < totalBots) {
      const unhealthyBots = healthResults.filter(r => !r.valid)
      for (const bot of unhealthyBots) {
        botLogger.warn(
          'StartupManager',
          `⚠️ Unhealthy bot: ${bot.botName} - ${bot.error}`
        )
      }
    }
  }

  /**
   * Validate final deployment
   */
  private async validateDeployment(): Promise<void> {
    botLogger.info('StartupManager', '🎯 Validating deployment...')

    // Check if API server is responding
    try {
      if (this.config.webhookDomain) {
        const testUrl = this.config.webhookDomain.startsWith('http')
          ? this.config.webhookDomain
          : `http://${this.config.webhookDomain}`

        const response = await fetch(testUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(10000),
        })

        if (response.ok) {
          botLogger.info('StartupManager', '✅ Domain is accessible')
        } else {
          botLogger.warn(
            'StartupManager',
            `⚠️ Domain returned status ${response.status}`
          )
        }
      }
    } catch (error) {
      botLogger.warn(
        'StartupManager',
        `⚠️ Domain accessibility check failed: ${error}`
      )
    }

    // Log final status
    const runningBots = this.botInstances.length
    const successfulWebhooks = this.webhookResults.filter(r => r.success).length

    botLogger.info(
      'StartupManager',
      `📈 Deployment summary: ${runningBots} bots, ${successfulWebhooks} webhooks`
    )
  }

  /**
   * Rollback on failure
   */
  private async rollbackOnFailure(): Promise<void> {
    botLogger.warn('StartupManager', '🔄 Attempting rollback...')

    for (const botMeta of this.botInstances) {
      try {
        await botMeta.bot.telegram.deleteWebhook({ drop_pending_updates: true })
        botLogger.info(
          'StartupManager',
          `🗑️ Cleared webhook for ${botMeta.name}`
        )
      } catch (error) {
        botLogger.error(
          'StartupManager',
          `❌ Rollback failed for ${botMeta.name}: ${error}`
        )
      }
    }
  }

  /**
   * Get deployment status
   */
  getDeploymentStatus(): any {
    return {
      botsRegistered: this.botInstances.length,
      webhookResults: this.webhookResults,
      config: this.config,
    }
  }
}

/**
 * Factory function to create and configure production startup manager
 */
export function createProductionStartup(): ProductionStartupManager {
  const config: ProductionStartupConfig = {
    webhookDomain: process.env.WEBHOOK_DOMAIN || 'http://test-render-farm.ru',
    webhookPath: process.env.WEBHOOK_PATH || '/webhook',
    webhookProtocol:
      (process.env.WEBHOOK_PROTOCOL as 'http' | 'https') || undefined,
    botPorts: {
      neuro_blogger_bot: 3001,
      MetaMuse_Manifest_bot: 3002,
      ZavaraBot: 3003,
      Gaia_Kamskaia_bot: 3004,
      Kaya_easy_art_bot: 3005,
      HaimGroupMedia_bot: 3006,
    },
    enableHealthCheck: true,
    startupTimeout: 60000, // 60 seconds
  }

  return new ProductionStartupManager(config)
}
