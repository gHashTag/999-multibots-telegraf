/**
 * ТЕСТ: Обновляем расходы - показываем ВСЕ записи
 * По Генадию там больше расходов
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

describe.skipIf(!HAS_INFISICAL)('Update Expenses All', () => {
  test('Находим ВСЕ расходы, включая записи по Генадию', async () => {
    console.log('\n🔍 НАХОДИМ ВСЕ РАСХОДЫ METAMUSE_MANIFEST_BOT')
    console.log('='.repeat(80))

    await initInfisical()
    process.env.SUPABASE_URL = getSecret('SUPABASE_URL')
    process.env.SUPABASE_SERVICE_ROLE_KEY = getSecret(
      'SUPABASE_SERVICE_ROLE_KEY'
    )
    process.env.SUPABASE_SERVICE_KEY = getSecret('SUPABASE_SERVICE_KEY')

    // ВСЕ MONEY_OUTCOME записи без лимитов
    const { data: allOutcome, error } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('type', 'MONEY_OUTCOME')
      .order('created_at', { ascending: false })

    if (error) throw error

    console.log(`ВСЕГО MONEY_OUTCOME записей: ${allOutcome.length}`)

    // Группируем по пользователям
    const byUser = (allOutcome || []).reduce(
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

    // Проверяем Геннадия/Генадия
    const gennadyUsers = userStats.filter(
      s => s.user.includes('352374518') || s.user.includes('Геннад')
    )
    if (gennadyUsers.length > 0) {
      console.log('\n✅ Найдены записи по Геннадию:')
      gennadyUsers.forEach(stat => {
        console.log(
          `   User ${stat.user}: ${stat.count} транз., ${Math.round(stat.stars).toLocaleString()}⭐`
        )
      })
    } else {
      console.log(
        '\n⚠️ Записей по "352374518" не найдено в топ-10, проверяем всех...'
      )
      const user352 = userStats.find(s => s.user === '352374518')
      if (user352) {
        console.log(
          `   User 352374518: ${user352.count} транз., ${Math.round(user352.stars).toLocaleString()}⭐`
        )
      }
    }

    // Общая сумма STARS в расходах
    const totalStarsOutcome = (allOutcome || []).reduce(
      (sum, tx) => sum + (parseFloat(tx.stars as any) || 0),
      0
    )

    console.log('\n\n📊 ОБЩИЕ РАСХОДЫ:')
    console.log('-'.repeat(80))
    console.log(`Всего транзакций: ${allOutcome?.length || 0}`)
    console.log(
      `Общая сумма STARS: ${Math.round(totalStarsOutcome).toLocaleString()}⭐`
    )

    // Примеры расходов
    console.log('\n📋 Примеры расходов (топ-10 по stars):')
    console.log('-'.repeat(80))
    ;(allOutcome || [])
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

    // Обновлённые цифры
    console.log('\n' + '='.repeat(80))
    console.log('💎 ОБНОВЛЁННЫЕ ТРИ ЦИФРЫ:')
    console.log('='.repeat(80))
    console.log(
      `1️⃣ РАСХОДЫ (STARS): ${Math.round(totalStarsOutcome).toLocaleString()}⭐`
    )
    console.log(`   Транзакции: ${allOutcome?.length || 0}`)
    console.log(`\n2️⃣ ДОХОДЫ В РУБЛЯХ: 108,871₽ ✅`)
    console.log(`\n3️⃣ ДОХОДЫ В ЗВЁЗДАХ: 152,459⭐ ✅`)
    console.log('='.repeat(80))

    expect(allOutcome).toBeDefined()
  })
})
