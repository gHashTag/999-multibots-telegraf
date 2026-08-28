/**
 * ТЕСТ: Ищем STARS доходы через поле stars (не amount!)
 */

import { describe, test, expect } from 'vitest'

// Этот файл — не юнит-тест, а разбор ЖИВОЙ базы: он поднимает секреты через
// Infisical и без них падает с «Infisical credentials missing». Раньше файл
// вообще не запускался (импорт из '@jest/globals' под vitest не грузится),
// поэтому проблема не была видна. Теперь прогон идёт ТОЛЬКО при наличии
// креденшелов: у кого они есть — анализ отработает, у остальных кейсы честно
// отметятся пропущенными, а не поломкой.
const HAS_INFISICAL = Boolean(
  process.env.INFISICAL_CLIENT_ID &&
    process.env.INFISICAL_CLIENT_SECRET &&
    process.env.INFISICAL_PROJECT_ID
)
import { initInfisical, getSecret } from '../core/infisical'
import { supabase } from '../core/supabase/client'

describe.skipIf(!HAS_INFISICAL)('Check Stars Field', () => {
  test('Ищем STARS доходы через поле stars', async () => {
    console.log('\n🔍 ИЩЕМ STARS ДОХОДЫ ЧЕРЕЗ ПОЛЕ STARS')
    console.log('='.repeat(80))

    await initInfisical()
    process.env.SUPABASE_URL = getSecret('SUPABASE_URL')
    process.env.SUPABASE_SERVICE_ROLE_KEY = getSecret(
      'SUPABASE_SERVICE_ROLE_KEY'
    )
    process.env.SUPABASE_SERVICE_KEY = getSecret('SUPABASE_SERVICE_KEY')

    // Ищем MONEY_INCOME с ненулевым полем stars
    const { data: starsIncome, error } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('type', 'MONEY_INCOME')
      .gt('stars', 0)
      .order('created_at', { ascending: false })

    if (error) throw error

    console.log(`Найдено MONEY_INCOME с ненулевым stars: ${starsIncome.length}`)

    if (starsIncome.length > 0) {
      console.log('\n📊 Подробно:')
      starsIncome.forEach((tx, i) => {
        const stars = parseFloat(tx.stars as any) || 0
        const date = new Date(tx.created_at as any)
        const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`

        console.log(`\n${i + 1}. ${stars.toLocaleString()}⭐ | ${dateStr}`)
        console.log(`   Currency: ${tx.currency}`)
        console.log(`   Amount: ${tx.amount}`)
        console.log(`   Stars: ${tx.stars}`)
        console.log(`   User: ${tx.telegram_id}`)
        console.log(`   Description: ${tx.description || 'без описания'}`)
      })

      const totalStars = starsIncome.reduce(
        (sum, tx) => sum + (parseFloat(tx.stars as any) || 0),
        0
      )
      console.log(
        `\n💰 ОБЩАЯ СУММА STARS: ${Math.round(totalStars).toLocaleString()}⭐`
      )
    } else {
      console.log('❌ MONEY_INCOME с ненулевым stars НЕ НАЙДЕНО!')
    }

    // Проверим также XTR Money Income с stars > 0
    console.log('\n\n📊 XTR Money Income со stars:')
    const { data: xtrWithStars } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('type', 'MONEY_INCOME')
      .eq('currency', 'XTR')
      .gt('stars', 0)

    console.log(`XTR со stars > 0: ${xtrWithStars.length}`)

    if (xtrWithStars.length > 0) {
      const sum = xtrWithStars.reduce(
        (s, tx) => s + (parseFloat(tx.stars as any) || 0),
        0
      )
      console.log(`Сумма stars в XTR: ${Math.round(sum).toLocaleString()}⭐`)
    }

    // Проверим RUB Money Income со stars > 0
    console.log('\n\n📊 RUB Money Income со stars:')
    const { data: rubWithStars } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('type', 'MONEY_INCOME')
      .eq('currency', 'RUB')
      .gt('stars', 0)

    console.log(`RUB со stars > 0: ${rubWithStars.length}`)

    if (rubWithStars.length > 0) {
      rubWithStars.forEach((tx, i) => {
        console.log(
          `${i + 1}. ${tx.amount}₽ + ${tx.stars}⭐ | ${tx.payment_method}`
        )
      })

      const starsSum = rubWithStars.reduce(
        (s, tx) => s + (parseFloat(tx.stars as any) || 0),
        0
      )
      console.log(
        `Сумма stars в RUB: ${Math.round(starsSum).toLocaleString()}⭐`
      )
    }

    expect(starsIncome).toBeDefined()
  })
})
