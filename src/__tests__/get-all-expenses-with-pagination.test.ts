/**
 * ТЕСТ: Получаем ВСЕ расходы с пагинацией
 * Supabase по умолчанию возвращает только 1000 записей
 */

import { describe, test, expect } from 'vitest'

// Разбор ЖИВОЙ базы через Infisical: без креденшелов файл падал с
// «Infisical credentials missing». Запускаем только при их наличии.
const HAS_INFISICAL = Boolean(
  process.env.INFISICAL_CLIENT_ID &&
    process.env.INFISICAL_CLIENT_SECRET &&
    process.env.INFISICAL_PROJECT_ID
)
import { initInfisical, getSecret } from '../core/infisical'
import { supabase } from '../core/supabase/client'

describe.skipIf(!HAS_INFISICAL)('Get All Expenses with Pagination', () => {
  test('Получаем ВСЕ расходы с пагинацией', async () => {
    console.log('\n🔍 ПОЛУЧАЕМ ВСЕ РАСХОДЫ С ПАГИНАЦИЕЙ')
    console.log('='.repeat(80))

    await initInfisical()
    process.env.SUPABASE_URL = getSecret('SUPABASE_URL')
    process.env.SUPABASE_SERVICE_ROLE_KEY = getSecret(
      'SUPABASE_SERVICE_ROLE_KEY'
    )
    process.env.SUPABASE_SERVICE_KEY = getSecret('SUPABASE_SERVICE_KEY')

    const pageSize = 1000 // Максимум за раз
    let allOutcome: any[] = []
    let from = 0
    let to = pageSize - 1
    let page = 1

    console.log(`\n📖 Загружаем данные страницами по ${pageSize} записей...`)

    while (true) {
      console.log(`   Страница ${page}: записи ${from}-${to}`)

      const { data, error } = await supabase
        .from('payments_v2')
        .select('*')
        .eq('bot_name', 'MetaMuse_Manifest_bot')
        .eq('type', 'MONEY_OUTCOME')
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) throw error

      if (!data || data.length === 0) {
        console.log(`   Пустая страница, завершаем`)
        break
      }

      allOutcome = allOutcome.concat(data)
      console.log(
        `   Загружено: ${data.length} записей (всего: ${allOutcome.length})`
      )

      if (data.length < pageSize) {
        console.log(`   Последняя страница`)
        break
      }

      from += pageSize
      to += pageSize
      page++
    }

    console.log(`\n✅ Завершено! Всего загружено: ${allOutcome.length} записей`)

    // Группируем по пользователям
    const byUser = allOutcome.reduce(
      (acc, tx) => {
        const user = tx.telegram_id || 'unknown'
        if (!acc[user]) acc[user] = []
        acc[user].push(tx)
        return acc
      },
      {} as Record<string, any[]>
    )

    console.log('\n📊 Расходы по пользователям (топ-10):')
    console.log('-'.repeat(80))

    const userStats = Object.entries(byUser)
      .map(([user, txs]) => {
        const starsSum = txs.reduce(
          (s, tx) => s + (parseFloat(tx.stars as any) || 0),
          0
        )
        return { user, count: txs.length, stars: starsSum }
      })
      .sort((a, b) => b.stars - a.stars)

    userStats.slice(0, 10).forEach((stat, i) => {
      console.log(
        `${i + 1}. User ${stat.user}: ${stat.count} транз., ${Math.round(stat.stars).toLocaleString()}⭐`
      )
    })

    // Проверяем 352374518
    const user352 = userStats.find(s => s.user === '352374518')
    if (user352) {
      console.log(
        `\n✅ User 352374518 (Геннадий): ${user352.count} транз., ${Math.round(user352.stars).toLocaleString()}⭐`
      )
    }

    // Общая сумма STARS в расходах
    const totalStarsOutcome = allOutcome.reduce(
      (sum, tx) => sum + (parseFloat(tx.stars as any) || 0),
      0
    )

    console.log('\n\n📊 ОБНОВЛЁННЫЕ РАСХОДЫ:')
    console.log('-'.repeat(80))
    console.log(`Всего транзакций: ${allOutcome.length}`)
    console.log(
      `Общая сумма STARS: ${Math.round(totalStarsOutcome).toLocaleString()}⭐`
    )

    // Примеры расходов
    console.log('\n📋 Примеры расходов (топ-10 по stars):')
    console.log('-'.repeat(80))
    allOutcome
      .sort(
        (a, b) =>
          (parseFloat(b.stars as any) || 0) - (parseFloat(a.stars as any) || 0)
      )
      .slice(0, 10)
      .forEach((tx, i) => {
        const stars = parseFloat(tx.stars as any) || 0
        const date = new Date(tx.created_at as any)
        const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`

        console.log(`${i + 1}. ${stars.toLocaleString()}⭐ | ${dateStr}`)
        console.log(`   User: ${tx.telegram_id}`)
        console.log(`   ${tx.description || 'без описания'}`)
      })

    // ФИНАЛЬНЫЕ ЦИФРЫ
    console.log('\n' + '='.repeat(80))
    console.log('💎 ФИНАЛЬНЫЕ ТРИ ЦИФРЫ (С ПАГИНАЦИЕЙ):')
    console.log('='.repeat(80))
    console.log(
      `1️⃣ РАСХОДЫ (STARS): ${Math.round(totalStarsOutcome).toLocaleString()}⭐`
    )
    console.log(`   Транзакции: ${allOutcome.length}`)
    console.log(`\n2️⃣ ДОХОДЫ В РУБЛЯХ: 108,871₽ ✅`)
    console.log(`\n3️⃣ ДОХОДЫ В ЗВЁЗДАХ: 152,459⭐ ✅`)
    console.log('='.repeat(80))

    expect(allOutcome.length).toBeGreaterThan(0)
  })
})
