/**
 * ТЕСТ: Сравниваем RUB доходы MetaMuse в backup vs основная
 * Ищем недостающие транзакции
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
import { initInfisical, getSecret, getSecretsStats } from '../core/infisical'
import { supabase } from '../core/supabase/client'

describe.skipIf(!HAS_INFISICAL)('Compare RUB Income: Backup vs Main', () => {
  test('Сравниваем RUB доходы и ищем недостающие в backup', async () => {
    console.log('\n🔍 СРАВНИВАЕМ RUB ДОХОДЫ: BACKUP VS ОСНОВНАЯ ТАБЛИЦА')
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

      // RUB доходы из основной таблицы
      console.log('📊 Загружаем RUB доходы из ОСНОВНОЙ таблицы...')
      const { data: rubIncomeMain, error: mainError } = await supabase
        .from('payments_v2')
        .select('*')
        .eq('bot_name', 'MetaMuse_Manifest_bot')
        .eq('currency', 'RUB')
        .eq('type', 'MONEY_INCOME')
        .gt('amount', 0)
        .order('created_at', { ascending: false })

      if (mainError) throw mainError

      const rubIncomeMainSum = rubIncomeMain.reduce(
        (sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0),
        0
      )
      console.log(
        `   Найдено: ${rubIncomeMain.length} транзакций, сумма: ${Math.round(rubIncomeMainSum).toLocaleString()}₽`
      )

      // RUB доходы из backup
      console.log('\n📊 Загружаем RUB доходы из BACKUP...')
      const { data: rubIncomeBackup, error: backupError } = await supabase
        .from('payments_v2_backup')
        .select('*')
        .eq('bot_name', 'MetaMuse_Manifest_bot')
        .eq('currency', 'RUB')
        .eq('type', 'MONEY_INCOME')
        .gt('amount', 0)
        .order('created_at', { ascending: false })

      if (backupError) throw backupError

      const rubIncomeBackupSum = rubIncomeBackup.reduce(
        (sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0),
        0
      )
      console.log(
        `   Найдено: ${rubIncomeBackup.length} транзакций, сумма: ${Math.round(rubIncomeBackupSum).toLocaleString()}₽`
      )

      // Ищем разницу
      console.log('\n' + '='.repeat(80))
      console.log('🔍 ИЩЕМ НЕДОСТАЮЩИЕ ТРАНЗАКЦИИ В BACKUP:')
      console.log('='.repeat(80))

      // Создаем ключи для сравнения (по id)
      const mainIds = new Set(rubIncomeMain.map(tx => tx.id))
      const backupIds = new Set(rubIncomeBackup.map(tx => tx.id))

      // Транзакции, которые есть в backup, но нет в основной
      const onlyInBackup = rubIncomeBackup.filter(tx => !mainIds.has(tx.id))

      console.log(
        `\nВ BACKUP есть, но НЕТ в основной: ${onlyInBackup.length} транзакций`
      )

      if (onlyInBackup.length > 0) {
        const onlyInBackupSum = onlyInBackup.reduce(
          (sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0),
          0
        )
        console.log(
          `Сумма недостающих: ${Math.round(onlyInBackupSum).toLocaleString()}₽`
        )

        console.log('\n📋 СПИСОК НЕДОСТАЮЩИХ ТРАНЗАКЦИЙ:')
        onlyInBackup.forEach((tx, i) => {
          const amount = Math.abs(parseFloat(tx.amount as any) || 0)
          const date = new Date(tx.created_at as any)
          const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`

          console.log(`\n   ${i + 1}. ${amount.toLocaleString()}₽ | ${dateStr}`)
          console.log(
            `      User: ${tx.telegram_id} | ${tx.payment_method || 'unknown'}`
          )
          console.log(`      ${tx.description || 'без описания'}`)
        })
      }

      // Транзакции, которые есть в основной, но нет в backup
      const onlyInMain = rubIncomeMain.filter(tx => !backupIds.has(tx.id))

      console.log(
        `\n\nВ ОСНОВНОЙ есть, но НЕТ в backup: ${onlyInMain.length} транзакций`
      )

      if (onlyInMain.length > 0) {
        const onlyInMainSum = onlyInMain.reduce(
          (sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0),
          0
        )
        console.log(`Сумма: ${Math.round(onlyInMainSum).toLocaleString()}₽`)

        onlyInMain.forEach((tx, i) => {
          const amount = Math.abs(parseFloat(tx.amount as any) || 0)
          const date = new Date(tx.created_at as any)
          const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`

          console.log(`\n   ${i + 1}. ${amount.toLocaleString()}₽ | ${dateStr}`)
          console.log(`      User: ${tx.telegram_id}`)
        })
      }

      // ИТОГ
      console.log('\n' + '='.repeat(80))
      console.log('💎 ИТОГОВОЕ СРАВНЕНИЕ:')
      console.log('='.repeat(80))
      console.log(`\nОсновная таблица:`)
      console.log(`   Транзакции: ${rubIncomeMain.length}`)
      console.log(`   Сумма: ${Math.round(rubIncomeMainSum).toLocaleString()}₽`)

      console.log(`\nBackup таблица:`)
      console.log(`   Транзакции: ${rubIncomeBackup.length}`)
      console.log(
        `   Сумма: ${Math.round(rubIncomeBackupSum).toLocaleString()}₽`
      )

      const difference = rubIncomeBackupSum - rubIncomeMainSum
      console.log(`\nРазница (backup - основная):`)
      console.log(
        `   Транзакции: ${rubIncomeBackup.length - rubIncomeMain.length > 0 ? '+' : ''}${rubIncomeBackup.length - rubIncomeMain.length}`
      )
      console.log(
        `   Сумма: ${Math.round(difference).toLocaleString()}₽ ${difference > 0 ? '⬆️' : difference < 0 ? '⬇️' : '➡️'}`
      )

      console.log(
        `\n🎯 РЕКОМЕНДАЦИЯ: Использовать ${rubIncomeBackup.length > rubIncomeMain.length ? 'BACKUP' : 'ОСНОВНУЮ'} таблицу для анализа!`
      )

      expect(rubIncomeBackup).toBeDefined()
      expect(rubIncomeMain).toBeDefined()
    } catch (error) {
      console.error('\n❌ Ошибка:', error)
      throw error
    }
  })
})
