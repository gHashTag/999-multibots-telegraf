#!/usr/bin/env bun

/**
 * Проверка баланса Stars через GramJS
 *
 * Использует TELEGRAM_SESSION_STRING из .env
 */

import 'dotenv/config'
import { GramJSClient } from './gramjs-client'
import { BOTS, MTPROTO_CONFIG } from './config'

async function main() {
  console.log('\n' + '='.repeat(60))
  console.log('       ПРОВЕРКА БАЛАНСА STARS (GramJS)')
  console.log('='.repeat(60) + '\n')

  if (!MTPROTO_CONFIG.api_id || !MTPROTO_CONFIG.api_hash) {
    console.error('❌ Не найдены TELEGRAM_API_ID и TELEGRAM_API_HASH в .env')
    process.exit(1)
  }

  const client = new GramJSClient({
    apiId: MTPROTO_CONFIG.api_id,
    apiHash: MTPROTO_CONFIG.api_hash,
    sessionString: MTPROTO_CONFIG.sessionString,
  })

  try {
    await client.connect()

    const me = await client.getMe()
    console.log(`Авторизован как: ${me.firstName} (@${me.username})\n`)

    let totalStars = 0
    let botsWithStars = 0

    for (const bot of BOTS) {
      try {
        const balance = await client.getStarsBalance(bot.username)

        totalStars += balance.withdrawable
        if (balance.withdrawable > 0) botsWithStars++

        const ready = balance.withdrawable >= 1000 && balance.canWithdraw
        const status = ready ? '🚀' : balance.withdrawable > 0 ? '⭐' : '○'

        console.log(`${status} @${bot.username}`)
        console.log(`   ${bot.description}`)
        console.log(`   Всего: ${balance.total.toLocaleString()} Stars`)
        console.log(`   Доступно: ${balance.withdrawable.toLocaleString()} Stars`)
        if (balance.overallRevenue) {
          console.log(`   Всего заработано: ${balance.overallRevenue.toLocaleString()} Stars`)
        }
        if (balance.usdValue) {
          console.log(`   ~$${balance.usdValue.toFixed(2)} USD`)
        }
        console.log(`   Вывод разрешен: ${balance.canWithdraw ? '✅ Да' : '❌ Нет'}`)
        if (ready) {
          console.log(`   🚀 ГОТОВ К ВЫВОДУ!`)
        } else if (balance.withdrawable > 0 && !balance.canWithdraw) {
          console.log(`   ⏳ Ожидание 21 день`)
        } else if (balance.withdrawable > 0 && balance.withdrawable < 1000) {
          console.log(`   📊 Нужно ещё ${(1000 - balance.withdrawable).toLocaleString()} Stars`)
        }
        console.log('')

        // Задержка между запросами
        await new Promise((r) => setTimeout(r, 500))
      } catch (error: any) {
        console.log(`❌ @${bot.username}: ${error.message}`)
      }
    }

    // Итого
    console.log('='.repeat(60))
    console.log('                      ИТОГО')
    console.log('='.repeat(60))
    console.log(`⭐ Ботов со Stars: ${botsWithStars}`)
    console.log(`💰 Всего доступно: ${totalStars.toLocaleString()} Stars`)
    console.log(`💵 ~$${(totalStars * 0.013).toFixed(2)} USD`)
    console.log('='.repeat(60) + '\n')

    await client.disconnect()
  } catch (error: any) {
    console.error('Ошибка:', error.message)
    process.exit(1)
  }
}

main()
