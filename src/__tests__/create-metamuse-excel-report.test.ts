/**
 * ТЕСТ: Создаем Excel отчет по MetaMuse_Manifest_bot
 */

import { describe, test, expect } from 'vitest'
import { initInfisical, getSecret, getSecretsStats } from '../core/infisical'
import { supabase } from '../core/supabase/client'
import ExcelJS from 'exceljs'

// Разбор ЖИВОЙ базы через Infisical: без креденшелов файл падает с
// «Infisical credentials missing». Запускаем только при их наличии.
const HAS_INFISICAL = Boolean(
  process.env.INFISICAL_CLIENT_ID &&
    process.env.INFISICAL_CLIENT_SECRET &&
    process.env.INFISICAL_PROJECT_ID
)

describe.skipIf(!HAS_INFISICAL)('MetaMuse_Manifest_bot Excel Report', () => {
  test('Создаем полный Excel отчет из live Supabase', async () => {
    console.log('\n📊 СОЗДАНИЕ EXCEL ОТЧЕТА ПО METAMUSE_MANIFEST_BOT')
    console.log('='.repeat(80))

    try {
      // Инициализируем Infisical
      console.log('\n🔐 Инициализируем Infisical...')
      await initInfisical()

      // Синхронизируем секреты
      process.env.SUPABASE_URL = getSecret('SUPABASE_URL')
      process.env.SUPABASE_SERVICE_ROLE_KEY = getSecret(
        'SUPABASE_SERVICE_ROLE_KEY'
      )
      process.env.SUPABASE_SERVICE_KEY = getSecret('SUPABASE_SERVICE_KEY')

      const stats = getSecretsStats()
      console.log(`✅ Загружено ${stats.totalSecrets} секретов\n`)

      // Получаем ВСЕ данные по MetaMuse_Manifest_bot
      console.log('📥 Загружаем данные из Supabase...')

      const { data: allData, error } = await supabase
        .from('payments_v2')
        .select('*')
        .eq('bot_name', 'MetaMuse_Manifest_bot')
        .order('created_at', { ascending: false })

      if (error) throw error
      if (!allData) throw new Error('No data returned')

      console.log(`✅ Загружено ${allData.length} транзакций\n`)

      // Создаем Excel workbook
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'Claude Code'
      workbook.created = new Date()

      // ===== SHEET 1: СВОДКА =====
      const summarySheet = workbook.addWorksheet('СВОДКА', {
        views: [{ state: 'frozen', ySplit: 1 }],
      })

      summarySheet.columns = [
        { header: 'Показатель', key: 'metric', width: 30 },
        { header: 'Количество', key: 'count', width: 15 },
        { header: 'Сумма', key: 'amount', width: 20 },
        { header: 'Валюта', key: 'currency', width: 10 },
        { header: 'Тип', key: 'type', width: 20 },
      ]

      // Стили заголовков
      summarySheet.getRow(1).font = { bold: true, size: 12 }
      summarySheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      }
      summarySheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true }

      // Разбиваем по валютам и типам
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

      // Добавляем строки в сводку
      summarySheet.addRow({
        metric: '💰 ДОХОДЫ В РУБЛЯХ',
        count: rubIncome.length,
        amount: Math.round(rubIncomeSum).toLocaleString(),
        currency: '₽',
        type: 'MONEY_INCOME',
      })

      summarySheet.addRow({
        metric: '⭐ ДОХОДЫ В ЗВЕЗДАХ',
        count: starsIncome.length,
        amount: Math.round(starsIncomeSum).toLocaleString(),
        currency: '⭐',
        type: 'MONEY_INCOME',
      })

      summarySheet.addRow({
        metric: '💸 РАСХОДЫ В ЗВЕЗДАХ',
        count: starsOutcome.length,
        amount: Math.round(starsOutcomeSum).toLocaleString(),
        currency: '⭐',
        type: 'MONEY_OUTCOME',
      })

      // ===== SHEET 2: RUB ДОХОДЫ =====
      const rubSheet = workbook.addWorksheet('RUB_доходы', {
        views: [{ state: 'frozen', ySplit: 1 }],
      })

      rubSheet.columns = [
        { header: '№', key: 'num', width: 5 },
        { header: 'Дата', key: 'date', width: 12 },
        { header: 'Сумма', key: 'amount', width: 12 },
        { header: 'Валюта', key: 'currency', width: 8 },
        { header: 'Тип', key: 'type', width: 15 },
        { header: 'Пользователь', key: 'user', width: 15 },
        { header: 'Способ оплаты', key: 'method', width: 20 },
        { header: 'Описание', key: 'description', width: 50 },
        { header: 'ID транзакции', key: 'id', width: 15 },
      ]

      // Заголовки RUB
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
          type: tx.type,
          user: tx.telegram_id,
          method: tx.payment_method || '',
          description: tx.description || '',
          id: tx.id,
        })
      })

      // ===== SHEET 3: STARS РАСХОДЫ =====
      const starsSheet = workbook.addWorksheet('STARS_расходы', {
        views: [{ state: 'frozen', ySplit: 1 }],
      })

      starsSheet.columns = [
        { header: '№', key: 'num', width: 5 },
        { header: 'Дата', key: 'date', width: 12 },
        { header: 'Сумма', key: 'amount', width: 12 },
        { header: 'Валюта', key: 'currency', width: 8 },
        { header: 'Тип', key: 'type', width: 15 },
        { header: 'Способ оплаты', key: 'method', width: 20 },
        { header: 'Описание', key: 'description', width: 60 },
        { header: 'ID транзакции', key: 'id', width: 15 },
      ]

      // Заголовки STARS
      starsSheet.getRow(1).font = { bold: true, size: 12 }
      starsSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFC55A5A' },
      }
      starsSheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true }

      // Берем только первые 500 расходов для Excel (ограничение)
      const starsOutcomeSample = starsOutcome.slice(0, 500)

      starsOutcomeSample.forEach((tx, i) => {
        const amount = Math.abs(parseFloat(tx.amount as any) || 0)
        const date = new Date(tx.created_at as any)
        const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`

        starsSheet.addRow({
          num: i + 1,
          date: dateStr,
          amount: Math.round(amount),
          currency: tx.currency,
          type: tx.type,
          method: tx.payment_method || '',
          description: tx.description || '',
          id: tx.id,
        })
      })

      // Сохраняем файл
      const fileName = `MetaMuse_Manifest_bot_FINAL_REPORT_${new Date().toISOString().split('T')[0]}.xlsx`
      await workbook.xlsx.writeFile(fileName)

      console.log('\n' + '='.repeat(80))
      console.log('✅ EXCEL ОТЧЕТ СОЗДАН!')
      console.log('='.repeat(80))
      console.log(`📁 Файл: ${fileName}`)
      console.log(`\n📊 СОДЕРЖИМОЕ:`)
      console.log(`   Лист 1: СВОДКА (3 строки)`)
      console.log(`   Лист 2: RUB_доходы (${rubIncome.length} строк)`)
      console.log(
        `   Лист 3: STARS_расходы (${starsOutcomeSample.length} из ${starsOutcome.length} строк)`
      )
      console.log(`\n💎 ИТОГО:`)
      console.log(
        `   1️⃣ РАСХОДЫ (STARS): ${Math.round(starsOutcomeSum).toLocaleString()}⭐`
      )
      console.log(
        `   2️⃣ ДОХОДЫ В РУБЛЯХ: ${Math.round(rubIncomeSum).toLocaleString()}₽`
      )
      console.log(
        `   3️⃣ ДОХОДЫ В ЗВЕЗДАХ: ${Math.round(starsIncomeSum).toLocaleString()}⭐`
      )
      console.log('='.repeat(80))

      expect(allData).toBeDefined()
      expect(allData.length).toBeGreaterThan(0)
    } catch (error) {
      console.error('\n❌ Ошибка:', error)
      throw error
    }
  })
})
