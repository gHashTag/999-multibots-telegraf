#!/usr/bin/env bun

/**
 * CLI tool for verifying webhook configurations
 */

import { Telegraf } from 'telegraf'
import { validateWebhookSetup } from './webhook-manager'
import { telegramClientOptions } from '@/services/telegramApi'

interface BotConfig {
  name: string
  token: string
  port?: number
}

async function verifyWebhooksFromEnv(): Promise<void> {
  console.log('🔍 Webhook Verification CLI Tool')
  console.log('================================')

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

  if (botConfigs.length === 0) {
    console.error('❌ No bot tokens found in environment variables')
    process.exit(1)
  }

  console.log(`🤖 Verifying ${botConfigs.length} bots`)
  console.log('')

  // Verify each bot
  const results = await Promise.all(
    botConfigs.map(async config => {
      const bot = new Telegraf(config.token, {
        telegram: telegramClientOptions(),
      })
      try {
        const validation = await validateWebhookSetup(bot, config.name)
        return { config, ...validation }
      } catch (error) {
        return {
          config,
          valid: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    })
  )

  // Report results
  console.log('📊 Webhook Verification Results:')
  console.log('================================')

  results.forEach(result => {
    const { config, valid, info, error } = result

    if (valid && info) {
      console.log(`✅ ${config.name}:`)
      console.log(`   URL: ${info.url || 'Not set'}`)
      console.log(`   Pending updates: ${info.pending_update_count || 0}`)
      console.log(`   URL accessible: ${info.urlAccessible ? 'Yes' : 'No'}`)

      if (info.last_error_date) {
        const errorDate = new Date(info.last_error_date * 1000).toISOString()
        console.log(`   Last error: ${info.last_error_message} (${errorDate})`)
      }

      if (info.urlError) {
        console.log(`   URL error: ${info.urlError}`)
      }
    } else {
      console.log(`❌ ${config.name}: ${error || 'Unknown error'}`)
    }
    console.log('')
  })

  const validCount = results.filter(r => r.valid).length
  const invalidCount = results.length - validCount

  console.log(`📈 Summary: ${validCount} valid, ${invalidCount} invalid`)

  if (invalidCount > 0) {
    process.exit(1)
  }
}

async function testWebhookUrl(url: string): Promise<void> {
  console.log(`🔗 Testing webhook URL: ${url}`)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TelegramBot/Webhook-Test',
      },
      body: JSON.stringify({
        update_id: 999999,
        message: {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 1, type: 'private' },
          from: { id: 1, is_bot: false, first_name: 'Test' },
          text: '/test',
        },
      }),
      signal: AbortSignal.timeout(10000),
    })

    console.log(`📡 Response status: ${response.status}`)

    if (response.ok) {
      console.log('✅ Webhook URL is accessible')
    } else {
      console.log('⚠️ Webhook URL returned non-success status')
    }
  } catch (error) {
    console.error('❌ Webhook URL test failed:', error)
  }
}

// CLI argument parsing
const args = process.argv.slice(2)
const command = args[0]

switch (command) {
  case 'verify':
  case undefined:
    verifyWebhooksFromEnv().catch(error => {
      console.error('❌ Webhook verification failed:', error)
      process.exit(1)
    })
    break

  case 'test':
    if (!args[1]) {
      console.error('❌ URL required for test command')
      console.log('Usage: bun run src/utils/webhook-verify-cli.ts test <url>')
      process.exit(1)
    }
    testWebhookUrl(args[1]).catch(error => {
      console.error('❌ URL test failed:', error)
      process.exit(1)
    })
    break

  case 'help':
  case '--help':
  case '-h':
    console.log(`
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
    console.error(`❌ Unknown command: ${command}`)
    console.log('Use "help" for usage information')
    process.exit(1)
}
