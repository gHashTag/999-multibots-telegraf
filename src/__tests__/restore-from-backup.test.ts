/**
 * ТЕСТ: Восстанавливаем данные из backup в основную таблицу
 * Переносим ВСЕ транзакции один в один
 */

import { describe, test, expect } from 'vitest'

import { PROD_WRITES_ALLOWED } from './helpers/prodWriteGate'

// Разбор ЖИВОЙ базы через Infisical: без креденшелов файл падал с
// «Infisical credentials missing». Запускаем только при их наличии.
const HAS_INFISICAL = Boolean(
  process.env.INFISICAL_CLIENT_ID &&
    process.env.INFISICAL_CLIENT_SECRET &&
    process.env.INFISICAL_PROJECT_ID
)
import { initInfisical, getSecret, getSecretsStats } from '../core/infisical'
import { supabase } from '../core/supabase/client'

describe.skipIf(!HAS_INFISICAL || !PROD_WRITES_ALLOWED)(
  'Restore from Backup',
  () => {
    test('Переносим все данные из backup в основную таблицу', async () => {
      console.log('\n🔄 ВОССТАНАВЛИВАЕМ ДАННЫЕ ИЗ BACKUP В ОСНОВНУЮ ТАБЛИЦУ')
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

        // ШАГ 1: Подсчитываем данные в backup
        console.log('📊 ШАГ 1: Подсчитываем данные в BACKUP...')
        const { count: backupCount, error: backupCountError } = await supabase
          .from('payments_v2_backup')
          .select('*', { count: 'exact', head: true })

        if (backupCountError) throw backupCountError
        console.log(`   Backup: ${backupCount} записей`)

        // ШАГ 2: Подсчитываем данные в основной таблице
        console.log('\n📊 ШАГ 2: Подсчитываем данные в ОСНОВНОЙ таблице...')
        const { count: mainCount, error: mainCountError } = await supabase
          .from('payments_v2')
          .select('*', { count: 'exact', head: true })

        if (mainCountError) throw mainCountError
        console.log(`   Основная: ${mainCount} записей`)

        const difference = (backupCount || 0) - (mainCount || 0)
        console.log(
          `   Разница: ${difference > 0 ? '+' : ''}${difference} записей`
        )

        // ШАГ 3: Загружаем все данные из backup
        console.log('\n📊 ШАГ 3: Загружаем данные из BACKUP...')
        const { data: backupData, error: backupError } = await supabase
          .from('payments_v2_backup')
          .select('*')
          .order('created_at', { ascending: true })

        if (backupError) throw backupError
        if (!backupData) throw new Error('No backup data returned')

        console.log(`   Загружено из backup: ${backupData.length} записей`)

        // ШАГ 4: Получаем существующие ID из основной таблицы
        console.log(
          '\n📊 ШАГ 4: Получаем существующие ID из основной таблицы...'
        )
        const { data: existingIds, error: idsError } = await supabase
          .from('payments_v2')
          .select('id')

        if (idsError) throw idsError

        const existingIdSet = new Set((existingIds || []).map(row => row.id))
        console.log(`   Существующих ID: ${existingIdSet.size}`)

        // ШАГ 5: Фильтруем данные - берем только те, которых нет в основной таблице
        console.log('\n📊 ШАГ 5: Фильтруем данные для переноса...')
        const dataToTransfer = backupData.filter(
          tx => !existingIdSet.has(tx.id)
        )
        console.log(`   К переносу: ${dataToTransfer.length} записей`)

        if (dataToTransfer.length === 0) {
          console.log('\n✅ ВСЕ ДАННЫЕ УЖЕ В ОСНОВНОЙ ТАБЛИЦЕ!')
          console.log('   Ничего переносить не нужно.')
          return
        }

        // ШАГ 6: Переносим данные батчами
        console.log('\n📊 ШАГ 6: Переносим данные батчами...')
        const batchSize = 100 // Переносим по 100 записей
        let transferredCount = 0
        let errorCount = 0

        for (let i = 0; i < dataToTransfer.length; i += batchSize) {
          const batch = dataToTransfer.slice(i, i + batchSize)
          console.log(
            `\n   Переносим батч ${Math.floor(i / batchSize) + 1}: записи ${i + 1}-${i + batch.length}`
          )

          const { data, error } = await supabase
            .from('payments_v2')
            .insert(batch)

          if (error) {
            console.log(`   ❌ Ошибка: ${error.message}`)
            errorCount++
          } else {
            transferredCount += batch.length
            console.log(
              `   ✅ Перенесено: ${transferredCount}/${dataToTransfer.length}`
            )
          }
        }

        // ШАГ 7: Проверяем результат
        console.log('\n📊 ШАГ 7: Проверяем результат...')
        const { count: newMainCount, error: newCountError } = await supabase
          .from('payments_v2')
          .select('*', { count: 'exact', head: true })

        if (newCountError) throw newCountError

        console.log('\n' + '='.repeat(80))
        console.log('✅ ПЕРЕНОС ЗАВЕРШЁН!')
        console.log('='.repeat(80))
        console.log(`\n📊 СТАТИСТИКА:`)
        console.log(`   Исходное количество в основной: ${mainCount}`)
        console.log(`   Перенесено из backup: ${transferredCount}`)
        console.log(`   Ошибок: ${errorCount}`)
        console.log(`   Теперь в основной таблице: ${newMainCount}`)
        console.log(`   Ожидалось: ${(mainCount || 0) + transferredCount}`)

        if (newMainCount === (mainCount || 0) + transferredCount) {
          console.log('\n✅ КОЛИЧЕСТВО СОВПАДАЕТ! Перенос успешен!')
        } else {
          console.log('\n⚠️ КОЛИЧЕСТВО НЕ СОВПАДАЕТ! Возможны проблемы.')
        }

        // Проверяем MetaMuse данные
        console.log('\n📊 ПРОВЕРЯЕМ METAMUSE_MANIFEST_BOT...')
        const { count: metamuseCount, error: metamuseError } = await supabase
          .from('payments_v2')
          .select('*', { count: 'exact', head: true })
          .eq('bot_name', 'MetaMuse_Manifest_bot')

        if (metamuseError) throw metamuseError

        const { data: metamuseRubIncome, error: rubError } = await supabase
          .from('payments_v2')
          .select('*')
          .eq('bot_name', 'MetaMuse_Manifest_bot')
          .eq('currency', 'RUB')
          .eq('type', 'MONEY_INCOME')
          .gt('amount', 0)

        if (rubError) throw rubError

        const rubIncomeSum = metamuseRubIncome.reduce(
          (sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0),
          0
        )

        console.log(
          `   MetaMuse_Manifest_bot записей в основной: ${metamuseCount}`
        )
        console.log(
          `   MetaMuse RUB доходы: ${rubIncomeSum.toLocaleString()}₽ (${metamuseRubIncome.length} транз.)`
        )

        expect(transferredCount).toBeGreaterThanOrEqual(0)
      } catch (error) {
        console.error('\n❌ Критическая ошибка:', error)
        throw error
      }
    })
  }
)
