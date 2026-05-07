#!/usr/bin/env bun

/**
 * Проверка доступных подарков и их цен через GramJS
 *
 * Лайфхак: вывод Stars через подарки обходит минимум в 1000 Stars
 */

import 'dotenv/config'
import { TelegramClient, Api } from 'telegram'
import { StringSession } from 'telegram/sessions'
import { MTPROTO_CONFIG } from './config'

async function main() {
  console.log('\n' + '='.repeat(60))
  console.log('       ДОСТУПНЫЕ ПОДАРКИ (для вывода Stars)')
  console.log('='.repeat(60) + '\n')

  if (!MTPROTO_CONFIG.api_id || !MTPROTO_CONFIG.api_hash) {
    console.error('❌ Не найдены TELEGRAM_API_ID и TELEGRAM_API_HASH в .env')
    process.exit(1)
  }

  const session = new StringSession(MTPROTO_CONFIG.sessionString || '')
  const client = new TelegramClient(session, MTPROTO_CONFIG.api_id, MTPROTO_CONFIG.api_hash, {
    connectionRetries: 5,
  })

  try {
    console.log('Подключение к Telegram...')
    await client.connect()
    console.log('Подключено!\n')

    // Получить список доступных подарков
    const gifts = await client.invoke(
      new Api.payments.GetStarGifts({
        hash: 0,
      })
    )

    if (gifts.className === 'payments.StarGifts') {
      console.log(`📦 Найдено подарков: ${gifts.gifts.length}\n`)

      // Дебаг: показать структуру первых 3 подарков
      console.log('📋 Структура первых 3 подарков:')
      for (let i = 0; i < 3 && i < gifts.gifts.length; i++) {
        const g = gifts.gifts[i]
        console.log(`\nПодарок ${i + 1}:`)
        console.log(`  className: ${g.className}`)
        console.log(`  id: ${g.id}`)
        console.log(`  stars: ${JSON.stringify(g.stars)}`)
        console.log(`  upgradeStars: ${JSON.stringify((g as any).upgradeStars)}`)
        console.log(`  sticker: ${g.sticker ? 'есть' : 'нет'}`)
        console.log(`  limitedCount: ${(g as any).limitedCount}`)
        console.log(`  availCount: ${(g as any).availCount}`)
      }
      console.log('')

      // Функция для получения цены
      const getPrice = (g: any): number => {
        const stars = g.stars
        // GramJS возвращает BigInt как объект
        // Просто конвертируем в Number независимо от типа
        try {
          // Пробуем Number() напрямую - работает с BigInt
          const num = Number(stars)
          if (!isNaN(num)) return num

          // Если это объект с amount
          if (stars?.amount) return Number(stars.amount)

          return 0
        } catch {
          return 0
        }
      }

      // Фильтруем только платные подарки
      const first = gifts.gifts[0]
      console.log('Проверка фильтра:')
      console.log(`  Первый подарок: stars=${first.stars}, getPrice=${getPrice(first)}`)
      console.log(`  Третий подарок: stars=${gifts.gifts[2].stars}, getPrice=${getPrice(gifts.gifts[2])}`)

      const upgradeableGifts = gifts.gifts.filter((g: any) => {
        const price = getPrice(g)
        const hasUpgrade = g.upgradeStars != null
        const notSoldOut = !g.soldOut
        return price > 0 && hasUpgrade && notSoldOut
      })

      const basicGifts = gifts.gifts.filter((g: any) => {
        const price = getPrice(g)
        return price > 0 && !g.soldOut && !g.upgradeStars
      })

      console.log(`  Всего: ${gifts.gifts.length} подарков`)
      console.log(`  С апгрейдом (доступные): ${upgradeableGifts.length}`)
      console.log(`  Базовые (без апгрейда): ${basicGifts.length}\n`)

      // Сортируем по цене (от дешёвых к дорогим)
      const sortedGifts = upgradeableGifts.sort((a, b) => {
        return getPrice(a) - getPrice(b)
      })

      console.log(`✨ Подарков с апгрейдом (доступных): ${upgradeableGifts.length}`)

      // Показываем либо с апгрейдом, либо базовые
      let showGifts = sortedGifts.length > 0 ? sortedGifts : basicGifts.sort((a, b) => getPrice(a) - getPrice(b))
      const giftType = sortedGifts.length > 0 ? 'с апгрейдом' : 'базовых'
      console.log(`💰 ТОП-10 самых дешёвых подарков (${giftType}):\n`)

      for (let i = 0; i < Math.min(10, showGifts.length); i++) {
        const gift = showGifts[i] as any
        const price = getPrice(gift)
        const upgradeStars = gift.upgradeStars ? Number(gift.upgradeStars.amount || gift.upgradeStars) : null
        const canUpgrade = upgradeStars ? `✅ Апгрейд: ${upgradeStars} Stars` : '🎁 Базовый подарок'
        const limited = gift.limitedCount ? `Лимит: ${gift.availCount || 0}/${gift.limitedCount}` : '♾️ Без лимита'
        const soldOut = gift.soldOut ? '🔴 РАСПРОДАН' : ''
        const title = gift.title || `Подарок`

        console.log(`${i + 1}. ${title} (ID: ${gift.id}) ${soldOut}`)
        console.log(`   💰 Цена: ${price} Stars (~$${(price * 0.013).toFixed(2)})`)
        console.log(`   ${canUpgrade}`)
        console.log(`   ${limited}`)
        console.log('')
      }

      // Итого
      console.log('='.repeat(60))
      console.log('                    СТРАТЕГИЯ')
      console.log('='.repeat(60))
      console.log('')
      console.log('🎯 Для вывода 545 Stars (@neuro_blogger_bot):')

      // Найти подарок близкий к 545 Stars
      const targetStars = 545
      const neuroBalance = 545
      const kosheyBalance = 497
      const totalBalance = neuroBalance + kosheyBalance

      if (upgradeableGifts.length > 0) {
        // Есть подарки с апгрейдом
        const cheapestUpgradeable = sortedGifts[0] as any
        const price = getPrice(cheapestUpgradeable)
        const upgradePrice = Number(cheapestUpgradeable.upgradeStars || 0)
        const totalCost = price + upgradePrice

        console.log(`   ✅ ЕСТЬ подарки с апгрейдом!`)
        console.log(`   Самый дешёвый: ${price} Stars + ${upgradePrice} апгрейд = ${totalCost} Stars`)
        console.log('')
        console.log(`   @neuro_blogger_bot (${neuroBalance} Stars):`)
        console.log(`      Можно купить: ${Math.floor(neuroBalance / totalCost)} подарков`)
        console.log('')
        console.log(`   @ai_koshey_bot (${kosheyBalance} Stars):`)
        console.log(`      Можно купить: ${Math.floor(kosheyBalance / totalCost)} подарков`)
        console.log('')
        console.log(`   📊 ИТОГО: ${Math.floor(totalBalance / totalCost)} коллекционных подарков`)
        console.log(`   💰 После продажи на Getgems: ~$${((Math.floor(totalBalance / totalCost)) * 0.5).toFixed(2)}+`)
      } else if (basicGifts.length > 0) {
        // Только базовые подарки
        const cheapest = basicGifts.sort((a, b) => getPrice(a) - getPrice(b))[0] as any
        const price = getPrice(cheapest)

        console.log(`   ⚠️ Подарки с апгрейдом РАСПРОДАНЫ`)
        console.log(`   Доступны только базовые (${price}+ Stars)`)
        console.log('')
        console.log('   ❌ Базовые подарки НЕЛЬЗЯ конвертировать в NFT')
        console.log('   ❌ Их нельзя продать на маркетплейсах')
        console.log('')
        console.log('   💡 АЛЬТЕРНАТИВА:')
        console.log('   • Подождать появления новых подарков с апгрейдом')
        console.log('   • Или дождаться 1000+ Stars для обычного вывода')
      } else {
        console.log('   ❌ Нет доступных подарков')
      }

      console.log('')
      console.log('📝 Процесс:')
      console.log('   1. Купить подарки на все Stars')
      console.log('   2. Апгрейднуть до коллекционных')
      console.log('   3. Подождать 14-21 день')
      console.log('   4. Минтить в NFT на TON')
      console.log('   5. Продать на Getgems/Fragment')
      console.log('')

    } else {
      console.log('Подарки недоступны:', gifts.className)
    }

    await client.disconnect()

  } catch (error: any) {
    console.error('Ошибка:', error.message)
    process.exit(1)
  }
}

main()
