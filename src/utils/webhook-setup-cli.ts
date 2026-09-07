#!/usr/bin/env bun

/**
 * CLI tool for setting up webhooks manually
 */

import { Telegraf } from 'telegraf'
import {
  setupWebhookWithRetry,
  autoConfigureProductionWebhooks,
} from './webhook-manager'
import { botLogger } from './logger'
import { telegramClientOptions } from '@/services/telegramApi'

interface BotConfig {
  name: string
  token: string
  port?: number
}

async function setupWebhooksFromEnv(): Promise<void> {
  console.log('🔗 Webhook Setup CLI Tool')
  console.log('========================')

  // Get configuration from environment
  const webhookDomain = process.env.WEBHOOK_DOMAIN || process.env.ORIGIN || ''
  const webhookPath = process.env.WEBHOOK_PATH || '/webhook'

  console.log(`📍 Domain: ${webhookDomain || '(not set)'}`)
  console.log(`📍 Path: ${webhookPath}`)
  console.log('')

  // Collect bot tokens from environment
  const botConfigs: BotConfig[] = []
  const botNames = [
    'neuro_blogger_bot',
    'MetaMuse_Manifest_bot',
    'ZavaraBot',
    'Gaia_Kamskaia_bot',
    'Kaya_easy_art_bot',
    'HaimGroupMedia_bot',
  ]

  for (let i = 1; i <= 10; i++) {
    const token = process.env[`BOT_TOKEN_${i}`]
    if (token) {
      const name = botNames[i - 1] || `bot_${i}`
      const port = 3000 + i
      botConfigs.push({ name, token, port })
    }
  }

  if (!webhookDomain) {
    console.error(
      '❌ WEBHOOK_DOMAIN/ORIGIN не задан. Укажите домен через переменные окружения.'
    )
    process.exit(1)
  }

  if (botConfigs.length === 0) {
    console.error('❌ No bot tokens found in environment variables')
    process.exit(1)
  }

  console.log(`🤖 Found ${botConfigs.length} bot tokens`)
  console.log('')

  // Setup webhooks
  const bots = botConfigs.map(config => ({
    bot: new Telegraf(config.token, { telegram: telegramClientOptions() }),
    name: config.name,
    port: config.port,
  }))

  const webhookConfig = {
    domain: webhookDomain.replace(/^https?:\/\//, ''),
    path: webhookPath,
    port: 3000, // Default port for webhooks
    retryAttempts: 3,
    retryDelay: 2000,
  }

  const results = await autoConfigureProductionWebhooks(bots, webhookConfig)

  // Report results
  console.log('\n📊 Webhook Setup Results:')
  console.log('=========================')

  results.forEach((result, index) => {
    const config = botConfigs[index]
    if (result.success) {
      console.log(`✅ ${config.name}: ${result.webhookUrl}`)
    } else {
      console.log(`❌ ${config.name}: ${result.error}`)
    }
  })

  const successCount = results.filter(r => r.success).length
  const failureCount = results.length - successCount

  console.log('')
  console.log(`📈 Summary: ${successCount} successful, ${failureCount} failed`)

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
      console.error('❌ Webhook setup failed:', error)
      process.exit(1)
    })
    break

  case 'help':
  case '--help':
  case '-h':
    console.log(`
🔗 Webhook Setup CLI

Usage:
  bun run src/utils/webhook-setup-cli.ts [command]

Commands:
  setup     Setup webhooks for all bots (default)
  help      Show this help message

Environment Variables:
  WEBHOOK_DOMAIN    Domain for webhooks (required)
  WEBHOOK_PATH      Path for webhooks (default: /webhook)
  BOT_TOKEN_1-10    Bot tokens

Examples:
  bun run src/utils/webhook-setup-cli.ts
  bun run src/utils/webhook-setup-cli.ts setup
`)
    break

  default:
    console.error(`❌ Unknown command: ${command}`)
    console.log('Use "help" for usage information')
    process.exit(1)
}
