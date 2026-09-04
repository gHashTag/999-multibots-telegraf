import { Telegraf, Context } from 'telegraf'
import { webhookSecretFor } from './webhookSecret'
import { botLogger, logSecurityEvent } from './logger'

/**
 * Enhanced webhook configuration for production deployments
 */
export interface WebhookConfig {
  enabled: boolean
  domain: string
  path: string
  port: number
  protocol?: 'http' | 'https'
  retryAttempts?: number
  retryDelay?: number
}

/**
 * Result of webhook setup operation
 */
export interface WebhookSetupResult {
  success: boolean
  webhookUrl?: string
  error?: string
  retryCount?: number
}

/**
 * Auto-detects the correct protocol for webhook domain
 * @param domain Domain to check
 * @returns 'http' or 'https'
 */
async function detectDomainProtocol(domain: string): Promise<'http' | 'https'> {
  try {
    // First try HTTPS
    const response = await fetch(`https://${domain}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    })
    if (response.ok) {
      return 'https'
    }
  } catch (error) {
    // HTTPS failed, try HTTP
    try {
      const response = await fetch(`http://${domain}`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      })
      if (response.ok) {
        return 'http'
      }
    } catch (httpError) {
      // Default to https if both fail
      return 'https'
    }
  }
  return 'https'
}

/**
 * Enhanced webhook setup with auto-retry and protocol detection
 * @param bot Telegraf bot instance
 * @param config Webhook configuration
 * @param botName Bot name for logging
 * @param botPort Specific port for this bot
 * @returns Promise<WebhookSetupResult>
 */
export async function setupWebhookWithRetry(
  bot: Telegraf<Context>,
  config: WebhookConfig,
  botName: string,
  botPort?: number
): Promise<WebhookSetupResult> {
  const maxRetries = config.retryAttempts || 3
  const retryDelay = config.retryDelay || 2000

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Auto-detect protocol if not specified
      const protocol =
        config.protocol || (await detectDomainProtocol(config.domain))

      // Build webhook URL with bot-specific path
      const webhookPath = botPort ? `${config.path}/${botName}` : config.path
      const webhookUrl = `${protocol}://${config.domain}${webhookPath}`

      botLogger.info(
        botName,
        `Setting up webhook (attempt ${attempt}/${maxRetries}): ${webhookUrl}`
      )

      // Set webhook
      await bot.telegram.setWebhook(webhookUrl, {
        allowed_updates: ['message', 'callback_query', 'pre_checkout_query'],
        // Same secret as the launch path in bot.ts, derived the same way from
        // the same token. Nothing imports this module today, and that is
        // exactly why the line belongs here: a dead copy that sets a webhook
        // WITHOUT the secret is a trap -- reviving it would silently switch
        // the protection off, which is the drift this loop keeps finding.
        secret_token: webhookSecretFor(bot.telegram.token), // secret-guard-ok: derived, not a literal
      })

      // Verify webhook was set correctly
      const webhookInfo = await bot.telegram.getWebhookInfo()

      if (webhookInfo.url === webhookUrl) {
        botLogger.info(
          botName,
          `✅ Webhook successfully configured: ${webhookUrl}`
        )

        // Log any pending updates or errors
        if (webhookInfo.pending_update_count > 0) {
          botLogger.warn(
            botName,
            `${webhookInfo.pending_update_count} pending updates`
          )
        }

        if (webhookInfo.last_error_date) {
          const errorDate = new Date(
            webhookInfo.last_error_date * 1000
          ).toISOString()
          botLogger.warn(
            botName,
            `Last webhook error: ${webhookInfo.last_error_message} (${errorDate})`
          )
        }

        return {
          success: true,
          webhookUrl,
          retryCount: attempt - 1,
        }
      } else {
        throw new Error(
          `Webhook URL mismatch. Expected: ${webhookUrl}, Got: ${webhookInfo.url}`
        )
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      botLogger.error(
        botName,
        `Webhook setup attempt ${attempt} failed: ${errorMessage}`
      )

      if (attempt === maxRetries) {
        logSecurityEvent(
          'webhook_setup_failed',
          { botName, errorMessage, attempts: maxRetries },
          'error'
        )

        return {
          success: false,
          error: errorMessage,
          retryCount: maxRetries,
        }
      }

      // Wait before retry
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay))
      }
    }
  }

  return {
    success: false,
    error: 'Max retries exceeded',
    retryCount: maxRetries,
  }
}

/**
 * Automatically configures webhooks for all production bots
 * @param bots Array of bot instances with metadata
 * @param baseConfig Base webhook configuration
 */
export async function autoConfigureProductionWebhooks(
  bots: Array<{ bot: Telegraf<Context>; name: string; port?: number }>,
  baseConfig: Omit<WebhookConfig, 'enabled'>
): Promise<WebhookSetupResult[]> {
  const results: WebhookSetupResult[] = []

  botLogger.info(
    'WebhookManager',
    `🔗 Starting webhook configuration for ${bots.length} bots`
  )

  // Configure webhooks in parallel with reasonable concurrency limit
  const concurrency = 3
  const chunks = []
  for (let i = 0; i < bots.length; i += concurrency) {
    chunks.push(bots.slice(i, i + concurrency))
  }

  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map(({ bot, name, port }) =>
        setupWebhookWithRetry(bot, { ...baseConfig, enabled: true }, name, port)
      )
    )
    results.push(...chunkResults)

    // Brief pause between chunks to avoid rate limiting
    if (chunks.indexOf(chunk) < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  const successCount = results.filter(r => r.success).length
  const failureCount = results.length - successCount

  botLogger.info(
    'WebhookManager',
    `🎯 Webhook configuration completed: ${successCount} successful, ${failureCount} failed`
  )

  return results
}

/**
 * Validates webhook configuration and connectivity
 * @param bot Bot instance
 * @param botName Bot name
 * @returns Validation result
 */
export async function validateWebhookSetup(
  bot: Telegraf<Context>,
  botName: string
): Promise<{ valid: boolean; info?: any; error?: string }> {
  try {
    const webhookInfo = await bot.telegram.getWebhookInfo()

    if (!webhookInfo.url) {
      return { valid: false, error: 'No webhook URL configured' }
    }

    // Test webhook URL accessibility
    try {
      const response = await fetch(webhookInfo.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true }),
        signal: AbortSignal.timeout(10000),
      })

      return {
        valid: true,
        info: {
          ...webhookInfo,
          urlAccessible: response.status < 500,
        },
      }
    } catch (fetchError) {
      return {
        valid: true, // Webhook is set, just URL might not be accessible yet
        info: {
          ...webhookInfo,
          urlAccessible: false,
          urlError:
            fetchError instanceof Error
              ? fetchError.message
              : String(fetchError),
        },
      }
    }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Legacy function for compatibility
 */
export async function configureWebhooks(
  bot: Telegraf<Context>,
  config: WebhookConfig,
  botName: string
): Promise<boolean> {
  const result = await setupWebhookWithRetry(bot, config, botName)
  return result.success
}

/**
 * Removes webhook for a bot
 * @param bot Bot instance
 * @param botName Bot name for logging
 */
export async function removeWebhook(
  bot: Telegraf<Context>,
  botName: string
): Promise<void> {
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true })
    botLogger.info(botName, '🗑️ Webhook removed')
  } catch (error) {
    botLogger.error(
      botName,
      `❌ Error removing webhook: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export default configureWebhooks
