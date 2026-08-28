/**
 * ТЕСТ: Проверяем ВСЕ ТИПЫ STARS транзакций для MetaMuse в backup
 */

import { describe, test, expect } from 'vitest'

// Разбор ЖИВОЙ базы через Infisical: без креденшелов файл падал с
// «Infisical credentials missing». Запускаем только при их наличии.
const HAS_INFISICAL = Boolean(
  process.env.INFISICAL_CLIENT_ID &&
    process.env.INFISICAL_CLIENT_SECRET &&
    process.env.INFISICAL_PROJECT_ID
)
import { initInfisical, getSecret, getSecretsStats } from '../core/infisical'
import { supabase } from '../core/supabase/client'

describe.skipIf(!HAS_INFISICAL)('MetaMuse All STARS Types in Backup', () => {
  test('Проверяем все типы STARS транзакций в backup', async () => {
    console.log(
      '\n🔍 ПРОВЕРЯЕМ ВСЕ ТИПЫ STARS ТРАНЗАКЦИЙ ДЛЯ METAMUSE В BACKUP'
    )
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

      // Получаем ВСЕ STARS транзакции для MetaMuse из backup (любой тип!)
      console.log('📊 Загружаем ВСЕ STARS транзакции MetaMuse из backup...')

      const { data: allStarsTransactions, error } = await supabase
        .from('payments_v2_backup')
        .select('*')
        .eq('bot_name', 'MetaMuse_Manifest_bot')
        .eq('currency', 'STARS')
        .order('created_at', { ascending: false })

      if (error) throw error
      if (!allStarsTransactions) throw new Error('No data returned')

      console.log(
        `✅ Загружено ${allStarsTransactions.length} STARS транзакций\n`
      )

      // Группируем по типам
      const byType = allStarsTransactions.reduce(
        (acc, tx) => {
          const type = tx.type || 'unknown'
          if (!acc[type]) {
            acc[type] = []
          }
          acc[type].push(tx)
          return acc
        },
        {} as Record<string, any[]>
      )

      console.log('📋 Группировка по типам:')
      console.log('-'.repeat(80))

      Object.entries(byType).forEach(([type, txs]) => {
        const sum = txs.reduce(
          (s, tx) => s + Math.abs(parseFloat(tx.amount as any) || 0),
          0
        )
        console.log(`\n${type}:`)
        console.log(`   Количество: ${txs.length} транзакций`)
        console.log(`   Общая сумма: ${Math.round(sum).toLocaleString()}⭐`)
      })

      // Проверяем каждый тип подробно
      Object.entries(byType).forEach(([type, txs]) => {
        console.log('\n' + '='.repeat(80))
        console.log(`🔍 ПОДРОБНО: ${type} (${txs.length} транзакций)`)
        console.log('='.repeat(80))

        // Показываем примеры (первые 5)
        txs.slice(0, 5).forEach((tx, i) => {
          const amount = Math.abs(parseFloat(tx.amount as any) || 0)
          const date = new Date(tx.created_at as any)
          const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`

          console.log(
            `\n   ${i + 1}. ${amount.toLocaleString()}⭐ | ${dateStr}`
          )
          console.log(`      Type: ${tx.type}`)
          console.log(`      Payment: ${tx.payment_method || 'unknown'}`)
          console.log(`      User: ${tx.telegram_id}`)
          console.log(`      Description: ${tx.description || 'без описания'}`)
        })

        // Если транзакций больше 5
        if (txs.length > 5) {
          console.log(`\n   ... и ещё ${txs.length - 5} транзакций`)
        }

        // Если это MONEY_INCOME или похожий тип
        if (
          type.toUpperCase().includes('INCOME') ||
          type.toUpperCase().includes('BONUS') ||
          type.toUpperCase().includes('ADD')
        ) {
          console.log('\n   ⚠️ ВНИМАНИЕ! Это может быть доход!')
        }
      })

      // Ищем потенциальные доходы
      console.log('\n\n' + '='.repeat(80))
      console.log('💰 ИЩЕМ ПОТЕНЦИАЛЬНЫЕ ДОХОДЫ В STARS:')
      console.log('='.repeat(80))

      const possibleIncomeTypes = Object.keys(byType).filter(
        type =>
          type.toUpperCase().includes('INCOME') ||
          type.toUpperCase().includes('BONUS') ||
          type.toUpperCase().includes('ADD') ||
          type.toUpperCase().includes('CREDIT')
      )

      if (possibleIncomeTypes.length > 0) {
        console.log('Найдены потенциальные типы доходов:', possibleIncomeTypes)

        possibleIncomeTypes.forEach(type => {
          const txs = byType[type]
          const sum = txs.reduce(
            (s, tx) => s + Math.abs(parseFloat(tx.amount as any) || 0),
            0
          )
          console.log(
            `\n${type}: ${txs.length} транз., ${Math.round(sum).toLocaleString()}⭐`
          )
        })
      } else {
        console.log('❌ Потенциальных типов доходов НЕ найдено!')
      }

      // Проверяем все уникальные типы
      console.log('\n\n📝 ВСЕ УНИКАЛЬНЫЕ ТИПЫ ТРАНЗАКЦИЙ:')
      console.log('-'.repeat(80))
      Object.keys(byType).forEach(type => {
        console.log(`   - ${type}`)
      })

      // ИТОГ
      console.log('\n' + '='.repeat(80))
      console.log('🎯 ИТОГ:')
      console.log('='.repeat(80))
      console.log(
        `Всего STARS транзакций MetaMuse в backup: ${allStarsTransactions.length}`
      )
      console.log(`Типов транзакций: ${Object.keys(byType).length}`)

      // Проверяем есть ли хоть какие-то положительные суммы
      const positiveTransactions = allStarsTransactions.filter(
        tx => parseFloat(tx.amount as any) > 0
      )
      console.log(
        `Транзакций с положительной суммой: ${positiveTransactions.length}`
      )

      expect(allStarsTransactions).toBeDefined()
      expect(Array.isArray(allStarsTransactions)).toBe(true)
    } catch (error) {
      console.error('\n❌ Ошибка:', error)
      throw error
    }
  })
})
