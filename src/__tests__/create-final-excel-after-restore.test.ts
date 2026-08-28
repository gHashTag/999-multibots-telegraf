/**
 * ТЕСТ: Создаём финальный Excel отчёт после восстановления
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
import ExcelJS from 'exceljs'

describe.skipIf(!HAS_INFISICAL)('Create Final Excel After Restore', () => {
  test('Создаём финальный Excel отчёт из восстановленной основной таблицы', async () => {
    console.log('\n📊 СОЗДАЁМ ФИНАЛЬНЫЙ EXCEL ОТЧЁТ ПОСЛЕ ВОССТАНОВЛЕНИЯ')
    console.log('='.repeat(80))

    await initInfisical()
    process.env.SUPABASE_URL = getSecret('SUPABASE_URL')
    process.env.SUPABASE_SERVICE_ROLE_KEY = getSecret(
      'SUPABASE_SERVICE_ROLE_KEY'
    )
    process.env.SUPABASE_SERVICE_KEY = getSecret('SUPABASE_SERVICE_KEY')

    // Получаем все данные MetaMuse из основной таблицы
    const { data: allData, error } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .order('created_at', { ascending: false })

    if (error) throw error

    const rubIncome = allData.filter(
      tx =>
        tx.currency === 'RUB' &&
        tx.type === 'MONEY_INCOME' &&
        parseFloat(tx.amount as any) > 0
    )
    const starsIncome = allData.filter(
      tx =>
        tx.currency === 'STARS' &&
        tx.type === 'MONEY_INCOME' &&
        parseFloat(tx.amount as any) > 0
    )
    const starsOutcome = allData.filter(
      tx => tx.currency === 'STARS' && tx.type === 'MONEY_OUTCOME'
    )

    const rubIncomeSum = rubIncome.reduce(
      (sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0),
      0
    )
    const starsIncomeSum = starsIncome.reduce(
      (sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0),
      0
    )
    const starsOutcomeSum = starsOutcome.reduce(
      (sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0),
      0
    )

    console.log(`Загружено ${allData.length} записей MetaMuse`)

    // Создаём Excel
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Claude Code'
    workbook.created = new Date()

    // СВОДКА
    const summarySheet = workbook.addWorksheet('СВОДКА', {
      views: [{ state: 'frozen', ySplit: 1 }],
    })
    summarySheet.columns = [
      { header: 'Показатель', key: 'metric', width: 30 },
      { header: 'Количество', key: 'count', width: 15 },
      { header: 'Сумма', key: 'amount', width: 20 },
      { header: 'Валюта', key: 'currency', width: 10 },
    ]

    summarySheet.getRow(1).font = { bold: true, size: 12 }
    summarySheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    }
    summarySheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true }

    summarySheet.addRow({
      metric: '💰 ДОХОДЫ В РУБЛЯХ (восстановлено)',
      count: rubIncome.length,
      amount: Math.round(rubIncomeSum).toLocaleString(),
      currency: '₽',
    })
    summarySheet.addRow({
      metric: '⭐ ДОХОДЫ В ЗВЕЗДАХ',
      count: starsIncome.length,
      amount: Math.round(starsIncomeSum).toLocaleString(),
      currency: '⭐',
    })
    summarySheet.addRow({
      metric: '💸 РАСХОДЫ В ЗВЕЗДАХ',
      count: starsOutcome.length,
      amount: Math.round(starsOutcomeSum).toLocaleString(),
      currency: '⭐',
    })

    // RUB ДОХОДЫ
    const rubSheet = workbook.addWorksheet('RUB_доходы', {
      views: [{ state: 'frozen', ySplit: 1 }],
    })
    rubSheet.columns = [
      { header: '№', key: 'num', width: 5 },
      { header: 'Дата', key: 'date', width: 12 },
      { header: 'Сумма', key: 'amount', width: 12 },
      { header: 'Валюта', key: 'currency', width: 8 },
      { header: 'Пользователь', key: 'user', width: 15 },
      { header: 'Способ оплаты', key: 'method', width: 20 },
      { header: 'Описание', key: 'description', width: 60 },
    ]

    rubSheet.getRow(1).font = { bold: true, size: 12 }
    rubSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF70AD47' },
    }
    rubSheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true }

    rubIncome.forEach((tx, i) => {
      const amount = Math.abs(parseFloat(tx.amount as any) || 0)
      const date = new Date(tx.created_at as any)
      const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`

      rubSheet.addRow({
        num: i + 1,
        date: dateStr,
        amount: Math.round(amount),
        currency: tx.currency,
        user: tx.telegram_id,
        method: tx.payment_method || '',
        description: tx.description || '',
      })
    })

    const fileName = `MetaMuse_Manifest_bot_RESTORED_${new Date().toISOString().split('T')[0]}.xlsx`
    await workbook.xlsx.writeFile(fileName)

    console.log('\n' + '='.repeat(80))
    console.log('✅ ФИНАЛЬНЫЙ ОТЧЁТ СОЗДАН!')
    console.log('='.repeat(80))
    console.log(`📁 Файл: ${fileName}`)
    console.log(`\n💎 ТРИ ЦИФРЫ (ИЗ ВОССТАНОВЛЕННОЙ ОСНОВНОЙ ТАБЛИЦЫ):`)
    console.log(
      `1️⃣ РАСХОДЫ (STARS): ${Math.round(starsOutcomeSum).toLocaleString()}⭐`
    )
    console.log(
      `2️⃣ ДОХОДЫ В РУБЛЯХ: ${Math.round(rubIncomeSum).toLocaleString()}₽ ✅ ВОССТАНОВЛЕНО!`
    )
    console.log(
      `3️⃣ ДОХОДЫ В ЗВЁЗДАХ: ${Math.round(starsIncomeSum).toLocaleString()}⭐`
    )
    console.log(`\n📊 СТАТИСТИКА:`)
    console.log(`   Всего записей MetaMuse: ${allData.length}`)
    console.log(`   RUB транзакции: ${rubIncome.length}`)
    console.log(`   STARS расходы: ${starsOutcome.length}`)
    console.log('='.repeat(80))

    expect(allData).toBeDefined()
  })
})
