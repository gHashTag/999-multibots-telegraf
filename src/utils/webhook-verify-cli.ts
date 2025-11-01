#!/usr/bin/env bun
import { logger } from '@/utils/enhancedLogger'

/**
 * CLI tool for verifying webhook configurations
 */

import { Telegraf } from 'telegraf'
import { validateWebhookSetup } from './webhook-manager'

interface BotConfig {
  name: string
  token: string
  port?: number
}

async function verifyWebhooksFromEnv(): Promise<void> {
  logger.debug('🔍 Webhook Verification CLI Tool')
  logger.debug('================================')

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

  logger.debug(`🤖 Verifying ${botConfigs.length} bots`)
  logger.debug('')

  // Verify each bot
  const results = await Promise.all(
    botConfigs.map(async (config) => {
      const bot = new Telegraf(config.token)
      try {
        const validation = await validateWebhookSetup(bot, config.name)
        return { config, ...validation }
      } catch (error) {
        return {
          config,
          valid: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    })
  )

  // Report results
  logger.debug('📊 Webhook Verification Results:')
  logger.debug('================================')
  
  results.forEach((result) => {
    const { config, valid, info, error } = result
    
    if (valid && info) {
      logger.debug(`✅ ${config.name}:`)
      logger.debug(`   URL: ${info.url || 'Not set'}`)
      logger.debug(`   Pending updates: ${info.pending_update_count || 0}`)
      logger.debug(`   URL accessible: ${info.urlAccessible ? 'Yes' : 'No'}`)
      
      if (info.last_error_date) {
        const errorDate = new Date(info.last_error_date * 1000).toISOString()
        logger.debug(`   Last error: ${info.last_error_message} (${errorDate})`)
      }
      
      if (info.urlError) {
        logger.debug(`   URL error: ${info.urlError}`)
      }
    } else {
      logger.debug(`❌ ${config.name}: ${error || 'Unknown error'}`)
    }
    logger.debug('')
  })

  const validCount = results.filter(r => r.valid).length
  const invalidCount = results.length - validCount

  logger.debug(`📈 Summary: ${validCount} valid, ${invalidCount} invalid`)
  
  if (invalidCount > 0) {
    process.exit(1)
  }
}

async function testWebhookUrl(url: string): Promise<void> {
  logger.debug(`🔗 Testing webhook URL: ${url}`)
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TelegramBot/Webhook-Test'
      },
      body: JSON.stringify({
        update_id: 999999,
        message: {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 1, type: 'private' },
          from: { id: 1, is_bot: false, first_name: 'Test' },
          text: '/test'
        }
      }),
      signal: AbortSignal.timeout(10000)
    })

    logger.debug(`📡 Response status: ${response.status}`)
    
    if (response.ok) {
      logger.debug('✅ Webhook URL is accessible')
    } else {
      logger.debug('⚠️ Webhook URL returned non-success status')
    }
  } catch (error) {
    logger.error('❌ Webhook URL test failed:', error)
  }
}

// CLI argument parsing
const args = process.argv.slice(2)
const command = args[0]

switch (command) {
  case 'verify':
  case undefined:
    verifyWebhooksFromEnv().catch(error => {
      logger.error('❌ Webhook verification failed:', error)
      process.exit(1)
    })
    break
    
  case 'test':
    if (!args[1]) {
      logger.error('❌ URL required for test command')
      logger.debug('Usage: bun run src/utils/webhook-verify-cli.ts test <url>')
      process.exit(1)
    }
    testWebhookUrl(args[1]).catch(error => {
      logger.error('❌ URL test failed:', error)
      process.exit(1)
    })
    break
    
  case 'help':
  case '--help':
  case '-h':
    logger.debug(`
🔍 Webhook Verification CLI

Usage:
  bun run src/utils/webhook-verify-cli.ts [command] [options]

Commands:
  verify    Verify webhook configurations for all bots (default)
  test <url> Test a specific webhook URL
  help      Show this help message

Environment Variables:
  BOT_TOKEN_1-10    Bot tokens

Examples:
  bun run src/utils/webhook-verify-cli.ts
  bun run src/utils/webhook-verify-cli.ts verify
  bun run src/utils/webhook-verify-cli.ts test https://your-domain.tld/webhook
`)
    break
    
  default:
    logger.error(`❌ Unknown command: ${command}`)
    logger.debug('Use "help" for usage information')
    process.exit(1)
}