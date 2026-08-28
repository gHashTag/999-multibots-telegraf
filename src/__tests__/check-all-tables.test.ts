/**
 * ТЕСТ: Проверяем ВСЕ таблицы payments_v2 в Supabase
 * payments_v2, payments_v2_backup, payments_v2_duplicate
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

describe.skipIf(!HAS_INFISICAL)('All payments_v2 Tables Check', () => {
  test('Проверяем все таблицы и ищем STARS доходы для MetaMuse', async () => {
    console.log('\n🔍 ПРОВЕРЯЕМ ВСЕ ТАБЛИЦЫ PAYMENTS_V2 В SUPABASE')
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

      const tables = [
        'payments_v2',
        'payments_v2_backup',
        'payments_v2_duplicate',
      ]
      const results: Record<string, any> = {}

      // Проверяем каждую таблицу
      for (const tableName of tables) {
        console.log(`📊 Таблица: ${tableName}`)
        console.log('-'.repeat(80))

        try {
          // 1. Общее количество записей
          const { count: totalCount, error: countError } = await supabase
            .from(tableName)
            .select('*', { count: 'exact', head: true })

          if (countError) {
            console.log(`❌ Ошибка подсчета: ${countError.message}`)
            continue
          }

          console.log(`   Всего записей: ${totalCount}`)

          // 2. STARS доходы для MetaMuse
          const { data: metamuseStarsIncome, error: incomeError } =
            await supabase
              .from(tableName)
              .select('*')
              .eq('bot_name', 'MetaMuse_Manifest_bot')
              .eq('currency', 'STARS')
              .eq('type', 'MONEY_INCOME')
              .gt('amount', 0)
              .order('created_at', { ascending: false })

          if (incomeError) {
            console.log(
              `   ❌ Ошибка запроса STARS доходов: ${incomeError.message}`
            )
          } else {
            const starsIncomeSum = metamuseStarsIncome.reduce(
              (sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0),
              0
            )
            console.log(
              `   STARS доходы MetaMuse: ${metamuseStarsIncome.length} транз., ${Math.round(starsIncomeSum).toLocaleString()}⭐`
            )
          }

          // 3. RUB доходы для MetaMuse
          const { data: metamuseRubIncome, error: rubError } = await supabase
            .from(tableName)
            .select('*')
            .eq('bot_name', 'MetaMuse_Manifest_bot')
            .eq('currency', 'RUB')
            .eq('type', 'MONEY_INCOME')
            .gt('amount', 0)

          if (rubError) {
            console.log(`   ❌ Ошибка запроса RUB доходов: ${rubError.message}`)
          } else {
            const rubIncomeSum = metamuseRubIncome.reduce(
              (sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0),
              0
            )
            console.log(
              `   RUB доходы MetaMuse: ${metamuseRubIncome.length} транз., ${Math.round(rubIncomeSum).toLocaleString()}₽`
            )
          }

          // 4. STARS расходы для MetaMuse
          const { data: metamuseStarsOutcome, error: outcomeError } =
            await supabase
              .from(tableName)
              .select('*')
              .eq('bot_name', 'MetaMuse_Manifest_bot')
              .eq('currency', 'STARS')
              .eq('type', 'MONEY_OUTCOME')

          if (outcomeError) {
            console.log(
              `   ❌ Ошибка запроса STARS расходов: ${outcomeError.message}`
            )
          } else {
            const starsOutcomeSum = metamuseStarsOutcome.reduce(
              (sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0),
              0
            )
            console.log(
              `   STARS расходы MetaMuse: ${metamuseStarsOutcome.length} транз., ${Math.round(starsOutcomeSum).toLocaleString()}⭐`
            )
          }

          // 5. Все STARS доходы (все боты)
          const { data: allStarsIncome, error: allStarsError } = await supabase
            .from(tableName)
            .select('*')
            .eq('currency', 'STARS')
            .eq('type', 'MONEY_INCOME')
            .gt('amount', 0)
            .order('created_at', { ascending: false })
            .limit(10)

          if (allStarsError) {
            console.log(
              `   ❌ Ошибка запроса всех STARS доходов: ${allStarsError.message}`
            )
          } else {
            const allStarsSum = allStarsIncome.reduce(
              (sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0),
              0
            )
            console.log(
              `   ВСЕГО STARS доходов (все боты): ${allStarsIncome.length} транз. (показано 10), ${Math.round(allStarsSum).toLocaleString()}⭐`
            )

            if (allStarsIncome.length > 0) {
              console.log(`      По ботам (из 10):`)
              const byBot = allStarsIncome.reduce(
                (acc, tx) => {
                  const bot = tx.bot_name || 'unknown'
                  if (!acc[bot]) acc[bot] = 0
                  acc[bot] += Math.abs(parseFloat(tx.amount as any) || 0)
                  return acc
                },
                {} as Record<string, number>
              )

              Object.entries(byBot).forEach(([bot, sum]) => {
                console.log(
                  `        ${bot}: ${Math.round(sum).toLocaleString()}⭐`
                )
              })
            }
          }

          // Сохраняем результаты
          results[tableName] = {
            totalCount,
            metamuseStarsIncome: metamuseStarsIncome || [],
            metamuseRubIncome: metamuseRubIncome || [],
            metamuseStarsOutcome: metamuseStarsOutcome || [],
            allStarsIncome: allStarsIncome || [],
          }
        } catch (error) {
          console.log(`❌ Критическая ошибка таблицы ${tableName}:`, error)
        }

        console.log('\n')
      }

      // СРАВНЕНИЕ ТАБЛИЦ
      console.log('\n' + '='.repeat(80))
      console.log('📈 СРАВНЕНИЕ ТАБЛИЦ:')
      console.log('='.repeat(80))

      tables.forEach(tableName => {
        const result = results[tableName]
        if (!result) return

        const metamuseStarsIncomeSum = result.metamuseStarsIncome.reduce(
          (sum: number, tx: any) => sum + Math.abs(parseFloat(tx.amount) || 0),
          0
        )
        const metamuseRubIncomeSum = result.metamuseRubIncome.reduce(
          (sum: number, tx: any) => sum + Math.abs(parseFloat(tx.amount) || 0),
          0
        )
        const metamuseStarsOutcomeSum = result.metamuseStarsOutcome.reduce(
          (sum: number, tx: any) => sum + Math.abs(parseFloat(tx.amount) || 0),
          0
        )

        console.log(`\n${tableName}:`)
        console.log(`   Всего записей: ${result.totalCount}`)
        console.log(
          `   MetaMuse STARS доходы: ${Math.round(metamuseStarsIncomeSum).toLocaleString()}⭐ (${result.metamuseStarsIncome.length} транз.)`
        )
        console.log(
          `   MetaMuse RUB доходы: ${Math.round(metamuseRubIncomeSum).toLocaleString()}₽ (${result.metamuseRubIncome.length} транз.)`
        )
        console.log(
          `   MetaMuse STARS расходы: ${Math.round(metamuseStarsOutcomeSum).toLocaleString()}⭐ (${result.metamuseStarsOutcome.length} транз.)`
        )
      })

      // ОПРЕДЕЛЯЕМ САМУЮ АКТУАЛЬНУЮ
      console.log('\n' + '='.repeat(80))
      console.log('🏆 ОПРЕДЕЛЯЕМ САМУЮ АКТУАЛЬНУЮ ТАБЛИЦУ:')
      console.log('='.repeat(80))

      let bestTable = ''
      let bestScore = -1

      tables.forEach(tableName => {
        const result = results[tableName]
        if (!result) return

        // Скоринг: больше записей + больше STARS доходов MetaMuse = лучше
        const score =
          (result.totalCount || 0) + result.metamuseStarsIncome.length * 1000

        console.log(`\n${tableName}: Score = ${score}`)
        console.log(`   Записей: ${result.totalCount}`)
        console.log(
          `   MetaMuse STARS доходы: ${result.metamuseStarsIncome.length} транз.`
        )

        if (score > bestScore) {
          bestScore = score
          bestTable = tableName
        }
      })

      console.log(`\n🎯 РЕЗУЛЬТАТ: Самая актуальная таблица = ${bestTable}`)
      console.log(`   Score: ${bestScore}`)

      // ЕСЛИ В backup/duplicate ЕСТЬ STARS ДОХОДЫ - ПОКАЗЫВАЕМ ИХ
      const backupTable = results['payments_v2_backup']
      const duplicateTable = results['payments_v2_duplicate']

      if (backupTable && backupTable.metamuseStarsIncome.length > 0) {
        console.log('\n' + '='.repeat(80))
        console.log('🎉 НАЙДЕНЫ STARS ДОХОДЫ В BACKUP!')
        console.log('='.repeat(80))

        backupTable.metamuseStarsIncome.forEach((tx: any, i: number) => {
          const amount = Math.abs(parseFloat(tx.amount) || 0)
          const date = new Date(tx.created_at)
          const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`

          console.log(`\n${i + 1}. ${amount.toLocaleString()}⭐ | ${dateStr}`)
          console.log(
            `   User: ${tx.telegram_id} | ${tx.payment_method || 'unknown'}`
          )
          console.log(`   ${tx.description || 'без описания'}`)
        })
      }

      if (duplicateTable && duplicateTable.metamuseStarsIncome.length > 0) {
        console.log('\n' + '='.repeat(80))
        console.log('🎉 НАЙДЕНЫ STARS ДОХОДЫ В DUPLICATE!')
        console.log('='.repeat(80))

        duplicateTable.metamuseStarsIncome.forEach((tx: any, i: number) => {
          const amount = Math.abs(parseFloat(tx.amount) || 0)
          const date = new Date(tx.created_at)
          const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`

          console.log(`\n${i + 1}. ${amount.toLocaleString()}⭐ | ${dateStr}`)
          console.log(
            `   User: ${tx.telegram_id} | ${tx.payment_method || 'unknown'}`
          )
          console.log(`   ${tx.description || 'без описания'}`)
        })
      }

      expect(results).toBeDefined()
    } catch (error) {
      console.error('\n❌ Ошибка:', error)
      throw error
    }
  })
})
