/**
 * ТЕСТ: Проверяем ВСЕ Money Income записи MetaMuse
 * Включая те, что могут иметь статус не COMPLETED или нулевую сумму
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

describe.skipIf(!HAS_INFISICAL)('Check All Money Income', () => {
  test('Проверяем ВСЕ Money Income записи MetaMuse', async () => {
    console.log('\n🔍 ПРОВЕРЯЕМ ВСЕ MONEY INCOME ЗАПИСИ METAMUSE')
    console.log('='.repeat(80))

    await initInfisical()
    process.env.SUPABASE_URL = getSecret('SUPABASE_URL')
    process.env.SUPABASE_SERVICE_ROLE_KEY = getSecret(
      'SUPABASE_SERVICE_ROLE_KEY'
    )
    process.env.SUPABASE_SERVICE_KEY = getSecret('SUPABASE_SERVICE_KEY')

    // Получаем ВСЕ Money Income записи для MetaMuse (БЕЗ ФИЛЬТРОВ!)
    const { data: allMoneyIncome, error } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('type', 'MONEY_INCOME')
      .order('created_at', { ascending: false })

    if (error) throw error

    console.log(`Найдено ВСЕХ Money Income записей: ${allMoneyIncome.length}`)

    // Группируем по валютам
    const byCurrency = allMoneyIncome.reduce(
      (acc, tx) => {
        const currency = tx.currency || 'unknown'
        if (!acc[currency]) acc[currency] = []
        acc[currency].push(tx)
        return acc
      },
      {} as Record<string, any[]>
    )

    console.log('\n📊 По валютам:')
    Object.entries(byCurrency).forEach(([currency, txs]) => {
      const sum = txs.reduce(
        (s, tx) => s + Math.abs(parseFloat(tx.amount as any) || 0),
        0
      )
      console.log(
        `   ${currency}: ${txs.length} транз., сумма: ${Math.round(sum).toLocaleString()}`
      )
    })

    // Проверяем STARS Money Income подробно
    if (byCurrency['STARS']) {
      console.log('\n\n📊 STARS Money Income подробно:')
      console.log('-'.repeat(80))

      byCurrency['STARS'].forEach((tx, i) => {
        const amount = Math.abs(parseFloat(tx.amount as any) || 0)
        const date = new Date(tx.created_at as any)
        const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`

        console.log(`\n${i + 1}. ${amount.toLocaleString()}⭐ | ${dateStr}`)
        console.log(`   Status: ${tx.status}`)
        console.log(`   User: ${tx.telegram_id}`)
        console.log(`   Description: ${tx.description || 'без описания'}`)
      })
    } else {
      console.log('\n\n❌ STARS Money Income НЕ НАЙДЕНО!')
    }

    // Проверяем RUB Money Income
    if (byCurrency['RUB']) {
      console.log('\n\n📊 RUB Money Income:')
      console.log('-'.repeat(80))
      console.log(`Количество: ${byCurrency['RUB'].length}`)
      const sum = byCurrency['RUB'].reduce(
        (s, tx) => s + Math.abs(parseFloat(tx.amount as any) || 0),
        0
      )
      console.log(`Сумма: ${Math.round(sum).toLocaleString()}₽`)
    }

    // Проверяем статусы
    console.log('\n\n📊 По статусам:')
    const byStatus = allMoneyIncome.reduce(
      (acc, tx) => {
        const status = tx.status || 'unknown'
        if (!acc[status]) acc[status] = []
        acc[status].push(tx)
        return acc
      },
      {} as Record<string, any[]>
    )

    Object.entries(byStatus).forEach(([status, txs]) => {
      console.log(`   ${status}: ${txs.length} транзакций`)
    })

    // ИТОГ
    console.log('\n' + '='.repeat(80))
    console.log('🎯 ИТОГ:')
    console.log('='.repeat(80))
    console.log(`Всего Money Income записей: ${allMoneyIncome.length}`)
    console.log(`RUB: ${byCurrency['RUB']?.length || 0} транз.`)
    console.log(`STARS: ${byCurrency['STARS']?.length || 0} транз.`)
    console.log(
      `Другие валюты: ${Object.keys(byCurrency).filter(c => c !== 'RUB' && c !== 'STARS').length}`
    )

    expect(allMoneyIncome).toBeDefined()
  })
})
