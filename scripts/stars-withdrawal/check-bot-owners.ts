#!/usr/bin/env bun

/**
 * Проверка владельцев ботов через Bot API
 *
 * Получает информацию о боте и его токене
 */

import 'dotenv/config'
import { telegramApiFor } from '../../src/services/telegramApi'

interface BotConfig {
  username: string
  tokenEnvVar: string
  description: string
}

const BOTS: BotConfig[] = [
  {
    username: 'neuro_blogger_bot',
    tokenEnvVar: 'BOT_TOKEN_1',
    description: 'NeuroBlogger',
  },
  {
    username: 'MetaMuse_Manifest_bot',
    tokenEnvVar: 'BOT_TOKEN_2',
    description: 'MetaMuse',
  },
  { username: 'ZavaraBot', tokenEnvVar: 'BOT_TOKEN_3', description: 'Zavara' },
  {
    username: 'LeeSolarbot',
    tokenEnvVar: 'BOT_TOKEN_4',
    description: 'LeeSolar',
  },
  {
    username: 'NeuroLenaAssistant_bot',
    tokenEnvVar: 'BOT_TOKEN_5',
    description: 'NeuroLena',
  },
  {
    username: 'NeurostylistShtogrina_bot',
    tokenEnvVar: 'BOT_TOKEN_6',
    description: 'Neurostylist',
  },
  {
    username: 'Gaia_Kamskaia_bot',
    tokenEnvVar: 'BOT_TOKEN_7',
    description: 'Gaia',
  },
  {
    username: 'Kaya_easy_art_bot',
    tokenEnvVar: 'BOT_TOKEN_8',
    description: 'Kaya',
  },
  {
    username: 'AI_STARS_bot',
    tokenEnvVar: 'BOT_TOKEN_9',
    description: 'AI Stars',
  },
  {
    username: 'ai_koshey_bot',
    tokenEnvVar: 'BOT_TOKEN_TEST_1',
    description: 'AI Koshey',
  },
  {
    username: 'clip_maker_neuro_bot',
    tokenEnvVar: 'BOT_TOKEN_TEST_2',
    description: 'Clip Maker',
  },
]

async function getBotInfo(token: string): Promise<any | null> {
  try {
    const response = await fetch(`${telegramApiFor(token)}/getMe`)
    const data = await response.json()
    return data.ok ? data.result : null
  } catch {
    return null
  }
}

async function getStarBalance(token: string): Promise<number | null> {
  try {
    const response = await fetch(
      `${telegramApiFor(token)}/getStarTransactions?limit=1`
    )
    const data = await response.json()
    // Bot API doesn't have getMyStarBalance directly, need to calculate from transactions
    // For now just check if we have access
    return data.ok ? 0 : null
  } catch {
    return null
  }
}

async function main() {
  console.log('\n' + '='.repeat(70))
  console.log('           ПРОВЕРКА ТОКЕНОВ БОТОВ')
  console.log('='.repeat(70) + '\n')

  const results: {
    username: string
    hasToken: boolean
    botId?: number
    balance?: number
  }[] = []

  for (const bot of BOTS) {
    const token = process.env[bot.tokenEnvVar]

    if (!token) {
      console.log(`❌ @${bot.username}: Токен НЕ НАЙДЕН (${bot.tokenEnvVar})`)
      results.push({ username: bot.username, hasToken: false })
      continue
    }

    const info = await getBotInfo(token)

    if (info) {
      console.log(`✅ @${bot.username}`)
      console.log(`   Bot ID: ${info.id}`)
      console.log(`   Токен: ${bot.tokenEnvVar} ✓`)

      // Try to get star balance via Bot API
      const response = await fetch(`${telegramApiFor(token)}/getMyStarBalance`)
      const balanceData = await response.json()

      if (balanceData.ok) {
        console.log(`   Stars: ${balanceData.result.amount}`)
        results.push({
          username: bot.username,
          hasToken: true,
          botId: info.id,
          balance: balanceData.result.amount,
        })
      } else {
        console.log(
          `   Stars: API недоступен (${balanceData.description || 'unknown'})`
        )
        results.push({ username: bot.username, hasToken: true, botId: info.id })
      }
    } else {
      console.log(`⚠️  @${bot.username}: Токен невалидный или бот удалён`)
      results.push({ username: bot.username, hasToken: false })
    }

    console.log('')
    await new Promise(r => setTimeout(r, 200))
  }

  // Summary
  console.log('='.repeat(70))
  console.log('                      ИТОГО')
  console.log('='.repeat(70))

  const withToken = results.filter(r => r.hasToken)
  const withBalance = results.filter(
    r => r.balance !== undefined && r.balance > 0
  )
  const totalBalance = results.reduce((sum, r) => sum + (r.balance || 0), 0)

  console.log(`📊 Ботов с токенами: ${withToken.length}/${BOTS.length}`)
  console.log(`⭐ Ботов со Stars: ${withBalance.length}`)
  console.log(`💰 Общий баланс: ${totalBalance.toLocaleString()} Stars`)
  console.log('')

  // Which tokens are missing?
  const missing = results.filter(r => !r.hasToken)
  if (missing.length > 0) {
    console.log('❌ Отсутствуют токены для:')
    missing.forEach(m => console.log(`   - @${m.username}`))
  }

  console.log('='.repeat(70) + '\n')
}

main().catch(console.error)
