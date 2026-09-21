#!/usr/bin/env bun

/**
 * Проверка баланса Stars через Bot API
 *
 * НЕ требует MTProto авторизации!
 * Использует токены ботов напрямую.
 *
 * Использование:
 *   bun run scripts/stars-withdrawal/check-balance-botapi.ts
 */

import 'dotenv/config'
import { telegramApiFor } from '../../src/services/telegramApi'

interface BotConfig {
  username: string
  tokenEnvVar: string
  description: string
}

// Все боты проекта
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

interface StarBalance {
  amount: number
  nanostar_amount?: number
}

async function getStarBalance(token: string): Promise<StarBalance | null> {
  try {
    const response = await fetch(`${telegramApiFor(token)}/getMyStarBalance`)
    const data = await response.json()

    if (data.ok) {
      return data.result
    } else {
      console.error(`  API Error: ${data.description}`)
      return null
    }
  } catch (error: any) {
    console.error(`  Network Error: ${error.message}`)
    return null
  }
}

async function getBotInfo(token: string): Promise<string> {
  try {
    const response = await fetch(`${telegramApiFor(token)}/getMe`)
    const data = await response.json()
    return data.ok ? `@${data.result.username}` : 'Unknown'
  } catch {
    return 'Unknown'
  }
}

async function main() {
  console.log('\n' + '='.repeat(60))
  console.log('       ПРОВЕРКА БАЛАНСА STARS (Bot API)')
  console.log('='.repeat(60) + '\n')

  let totalStars = 0
  let botsWithStars = 0
  let botsChecked = 0

  for (const bot of BOTS) {
    const token = process.env[bot.tokenEnvVar]

    if (!token) {
      console.log(
        `⚠️  ${bot.description}: Токен не найден (${bot.tokenEnvVar})`
      )
      continue
    }

    botsChecked++
    const balance = await getStarBalance(token)

    if (balance) {
      const stars = balance.amount
      totalStars += stars

      if (stars > 0) {
        botsWithStars++
        const usd = (stars * 0.013).toFixed(2)
        const ready = stars >= 1000 ? '🚀 ГОТОВ К ВЫВОДУ!' : ''
        console.log(`⭐ @${bot.username}`)
        console.log(`   ${bot.description}`)
        console.log(`   Баланс: ${stars.toLocaleString()} Stars (~$${usd})`)
        if (ready) console.log(`   ${ready}`)
        console.log('')
      } else {
        console.log(`○  @${bot.username}: 0 Stars`)
      }
    } else {
      console.log(`❌ @${bot.username}: Ошибка получения баланса`)
    }

    // Небольшая задержка между запросами
    await new Promise(r => setTimeout(r, 200))
  }

  // Итого
  console.log('\n' + '='.repeat(60))
  console.log('                      ИТОГО')
  console.log('='.repeat(60))
  console.log(`📊 Проверено ботов: ${botsChecked}`)
  console.log(`⭐ Ботов со Stars: ${botsWithStars}`)
  console.log(`💰 Всего Stars: ${totalStars.toLocaleString()}`)
  console.log(`💵 ~$${(totalStars * 0.013).toFixed(2)} USD`)

  if (totalStars >= 1000) {
    console.log('')
    console.log('✅ Готово к выводу! Используйте:')
    console.log('   bun run scripts/stars-withdrawal withdraw')
    console.log('')
    console.log('⚠️  Примечание: MTProto сейчас заблокирован (FLOOD_WAIT)')
    console.log('   Подождите ~15 часов или выводите через @BotFather')
  }

  console.log('='.repeat(60) + '\n')
}

main().catch(console.error)
