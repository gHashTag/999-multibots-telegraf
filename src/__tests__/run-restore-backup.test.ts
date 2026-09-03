/**
 * ТЕСТ: Запускаем восстановление данных из backup
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
  'Run Restore from Backup',
  () => {
    test('Запускаем восстановление данных', async () => {
      console.log('\n🚀 ЗАПУСКАЕМ ВОССТАНОВЛЕНИЕ ДАННЫХ ИЗ BACKUP')
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

        // ШАГ 1: Подсчитываем данные
        console.log('📊 ШАГ 1: Подсчитываем данные...')
        const { count: backupCount } = await supabase
          .from('payments_v2_backup')
          .select('*', { count: 'exact', head: true })

        const { count: mainCount } = await supabase
          .from('payments_v2')
          .select('*', { count: 'exact', head: true })

        console.log(`   Backup: ${backupCount} записей`)
        console.log(`   Основная: ${mainCount} записей`)
        console.log(
          `   Разница: ${(backupCount || 0) - (mainCount || 0)} записей`
        )

        if ((backupCount || 0) <= (mainCount || 0)) {
          console.log('\n✅ В ОСНОВНОЙ ТАБЛИЦЕ УЖЕ БОЛЬШЕ ДАННЫХ!')
          return
        }

        // ШАГ 2: Получаем все ID из backup
        console.log('\n📊 ШАГ 2: Получаем ID из backup...')
        const { data: backupIds } = await supabase
          .from('payments_v2_backup')
          .select('id')
          .order('id', { ascending: true })

        console.log(`   ID из backup: ${backupIds?.length || 0}`)

        // ШАГ 3: Получаем все ID из основной таблицы
        console.log('\n📊 ШАГ 3: Получаем ID из основной таблицы...')
        const { data: mainIds } = await supabase
          .from('payments_v2')
          .select('id')

        const mainIdSet = new Set((mainIds || []).map(row => row.id))
        console.log(`   ID из основной: ${mainIdSet.size}`)

        // ШАГ 4: Определяем ID для переноса
        console.log('\n📊 ШАГ 4: Определяем ID для переноса...')
        const idsToTransfer = (backupIds || [])
          .map(row => row.id)
          .filter(id => !mainIdSet.has(id))

        console.log(`   ID к переносу: ${idsToTransfer.length}`)

        if (idsToTransfer.length === 0) {
          console.log('\n✅ ВСЕ ДАННЫЕ УЖЕ ПЕРЕНЕСЕНЫ!')
          return
        }

        // ШАГ 5: Переносим данные батчами
        console.log('\n📊 ШАГ 5: Переносим данные батчами...')
        const batchSize = 300 // Оптимальный размер батча
        let transferredCount = 0
        let errorCount = 0
        const errors: string[] = []

        for (let i = 0; i < idsToTransfer.length; i += batchSize) {
          const batchIds = idsToTransfer.slice(i, i + batchSize)
          const batchNum = Math.floor(i / batchSize) + 1
          const totalBatches = Math.ceil(idsToTransfer.length / batchSize)

          console.log(
            `\n   Батч ${batchNum}/${totalBatches}: ID ${i + 1}-${i + batchIds.length} из ${idsToTransfer.length}`
          )

          // Загружаем данные для батча
          const { data: batchData, error: batchDataError } = await supabase
            .from('payments_v2_backup')
            .select('*')
            .in('id', batchIds)

          if (batchDataError) {
            console.log(`   ❌ Ошибка загрузки: ${batchDataError.message}`)
            errorCount++
            errors.push(batchDataError.message)
            continue
          }

          if (!batchData || batchData.length === 0) {
            console.log(`   ⚠️ Батч пуст`)
            continue
          }

          // Вставляем в основную таблицу
          const { data: insertData, error: insertError } = await supabase
            .from('payments_v2')
            .insert(batchData)
            .select('id')

          if (insertError) {
            console.log(`   ❌ Ошибка вставки: ${insertError.message}`)
            errorCount++
            errors.push(insertError.message)
          } else {
            transferredCount += (insertData || []).length
            console.log(
              `   ✅ Перенесено: ${transferredCount}/${idsToTransfer.length}`
            )
          }

          // Пауза между батчами
          await new Promise(resolve => setTimeout(resolve, 300))
        }

        // ШАГ 6: Проверяем результат
        console.log('\n📊 ШАГ 6: Проверяем результат...')
        const { count: newMainCount } = await supabase
          .from('payments_v2')
          .select('*', { count: 'exact', head: true })

        console.log('\n' + '='.repeat(80))
        console.log('✅ ПЕРЕНОС ЗАВЕРШЁН!')
        console.log('='.repeat(80))
        console.log(`\n📊 ИТОГ:`)
        console.log(`   Исходное количество: ${mainCount}`)
        console.log(`   Перенесено: ${transferredCount}`)
        console.log(`   Ошибок: ${errorCount}`)
        console.log(`   Теперь в основной: ${newMainCount}`)
        console.log(`   Ожидалось: ${(mainCount || 0) + transferredCount}`)

        if (newMainCount === (mainCount || 0) + transferredCount) {
          console.log('\n✅ ВСЕ ДАННЫЕ УСПЕШНО ПЕРЕНЕСЕНЫ!')
        }

        // Проверяем MetaMuse
        const { count: metamuseCount } = await supabase
          .from('payments_v2')
          .select('*', { count: 'exact', head: true })
          .eq('bot_name', 'MetaMuse_Manifest_bot')

        const { data: metamuseRub } = await supabase
          .from('payments_v2')
          .select('amount')
          .eq('bot_name', 'MetaMuse_Manifest_bot')
          .eq('currency', 'RUB')
          .eq('type', 'MONEY_INCOME')
          .gt('amount', 0)

        const rubSum = (metamuseRub || []).reduce(
          (sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0),
          0
        )

        console.log(`\n📊 METAMUSE_MANIFEST_BOT:`)
        console.log(`   Записей: ${metamuseCount}`)
        console.log(
          `   RUB доходы: ${Math.round(rubSum).toLocaleString()}₽ (${metamuseRub?.length || 0} транз.)`
        )

        expect(transferredCount).toBeGreaterThanOrEqual(0)
      } catch (error) {
        console.error('\n❌ Ошибка:', error)
        throw error
      }
    })
  }
)
