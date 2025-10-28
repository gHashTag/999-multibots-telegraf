#!/usr/bin/env bun
import { logger } from '@/utils/enhancedLogger'

/**
 * CLI tool for setting up webhooks manually
 */

import { Telegraf } from 'telegraf'
import { setupWebhookWithRetry, autoConfigureProductionWebhooks } from './webhook-manager'
import { botLogger } from './logger'

interface BotConfig {
  name: string
  token: string
  port?: number
}

async function setupWebhooksFromEnv(): Promise<void> {
  logger.debug('🔗 Webhook Setup CLI Tool')
  logger.debug('========================')

  // Get configuration from environment
  const webhookDomain = process.env.WEBHOOK_DOMAIN || 'http://test-render-farm.ru'
  const webhookPath = process.env.WEBHOOK_PATH || '/webhook'
  
  logger.debug(`📍 Domain: ${webhookDomain}`)
  logger.debug(`📍 Path: ${webhookPath}`)
  logger.debug('')

  // Collect bot tokens from environment
  const botConfigs: BotConfig[] = []
  const botNames = [
    'neuro_blogger_bot',
    'MetaMuse_Manifest_bot', 
    'ZavaraBot',
    'Gaia_Kamskaia_bot',
    'Kaya_easy_art_bot',
    'HaimGroupMedia_bot'
  ]

  for (let i = 1; i <= 10; i++) {
    const token = process.env[`BOT_TOKEN_${i}`]
    if (token) {
      const name = botNames[i - 1] || `bot_${i}`
      const port = 3000 + i
      botConfigs.push({ name, token, port })
    }
  }

  if (botConfigs.length === 0) {
    logger.error('❌ No bot tokens found in environment variables')
    process.exit(1)
  }

  logger.debug(`🤖 Found ${botConfigs.length} bot tokens`)
  logger.debug('')

  // Setup webhooks
  const bots = botConfigs.map(config => ({
    bot: new Telegraf(config.token),
    name: config.name,
    port: config.port
  }))

  const webhookConfig = {
    domain: webhookDomain.replace(/^https?:\/\//, ''),
    path: webhookPath,
    port: 3000, // Default port for webhooks
    retryAttempts: 3,
    retryDelay: 2000
  }

  const results = await autoConfigureProductionWebhooks(bots, webhookConfig)

  // Report results
  logger.debug('\n📊 Webhook Setup Results:')
  logger.debug('=========================')
  
  results.forEach((result, index) => {
    const config = botConfigs[index]
    if (result.success) {
      logger.debug(`✅ ${config.name}: ${result.webhookUrl}`)
    } else {
      logger.debug(`❌ ${config.name}: ${result.error}`)
    }
  })

  const successCount = results.filter(r => r.success).length
  const failureCount = results.length - successCount

  logger.debug('')
  logger.debug(`📈 Summary: ${successCount} successful, ${failureCount} failed`)
  
  if (failureCount > 0) {
    process.exit(1)
  }
}

// CLI argument parsing
const args = process.argv.slice(2)
const command = args[0]

switch (command) {
  case 'setup':
  case undefined:
    setupWebhooksFromEnv().catch(error => {
      logger.error('❌ Webhook setup failed:', error)
      process.exit(1)
    })
    break
    
  case 'help':
  case '--help':
  case '-h':
    logger.debug(`
🔗 Webhook Setup CLI

Usage:
  bun run src/utils/webhook-setup-cli.ts [command]

Commands:
  setup     Setup webhooks for all bots (default)
  help      Show this help message

Environment Variables:
  WEBHOOK_DOMAIN    Domain for webhooks (default: http://test-render-farm.ru)
  WEBHOOK_PATH      Path for webhooks (default: /webhook)
  BOT_TOKEN_1-10    Bot tokens

Examples:
  bun run src/utils/webhook-setup-cli.ts
  bun run src/utils/webhook-setup-cli.ts setup
`)
    break
    
  default:
    logger.error(`❌ Unknown command: ${command}`)
    logger.debug('Use "help" for usage information')
    process.exit(1)
}