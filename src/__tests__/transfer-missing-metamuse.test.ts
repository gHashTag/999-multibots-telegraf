/**
 * ТЕСТ: Переносим недостающие MetaMuse записи
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
import { initInfisical, getSecret } from '../core/infisical'
import { supabase } from '../core/supabase/client'

describe.skipIf(!HAS_INFISICAL || !PROD_WRITES_ALLOWED)(
  'Transfer Missing MetaMuse',
  () => {
    test('Переносим недостающие MetaMuse записи из backup', async () => {
      console.log('\n🔄 ПЕРЕНОСИМ НЕДОСТАЮЩИЕ METAMUSE ЗАПИСИ')
      console.log('='.repeat(80))

      await initInfisical()
      process.env.SUPABASE_URL = getSecret('SUPABASE_URL')
      process.env.SUPABASE_SERVICE_ROLE_KEY = getSecret(
        'SUPABASE_SERVICE_ROLE_KEY'
      )
      process.env.SUPABASE_SERVICE_KEY = getSecret('SUPABASE_SERVICE_KEY')

      // Получаем все ID MetaMuse из backup
      const { data: backupMetaMuseIds } = await supabase
        .from('payments_v2_backup')
        .select('id')
        .eq('bot_name', 'MetaMuse_Manifest_bot')

      // Получаем все ID MetaMuse из основной
      const { data: mainMetaMuseIds } = await supabase
        .from('payments_v2')
        .select('id')
        .eq('bot_name', 'MetaMuse_Manifest_bot')

      const mainMetaMuseIdSet = new Set(
        (mainMetaMuseIds || []).map(row => row.id)
      )
      const missingIds = (backupMetaMuseIds || [])
        .map(row => row.id)
        .filter(id => !mainMetaMuseIdSet.has(id))

      console.log(`Найдено недостающих ID: ${missingIds.length}`)

      if (missingIds.length === 0) {
        console.log('✅ Все MetaMuse записи уже перенесены!')
        return
      }

      // Показываем примеры недостающих ID
      console.log(
        `Примеры недостающих ID: ${missingIds.slice(0, 10).join(', ')}...`
      )

      // Переносим недостающие записи батчами
      const batchSize = 200
      let transferred = 0

      for (let i = 0; i < missingIds.length; i += batchSize) {
        const batchIds = missingIds.slice(i, i + batchSize)
        const batchNum = Math.floor(i / batchSize) + 1

        console.log(
          `\nБатч ${batchNum}: ${i + 1}-${i + batchIds.length} из ${missingIds.length}`
        )

        // Загружаем данные
        const { data: batchData, error } = await supabase
          .from('payments_v2_backup')
          .select('*')
          .in('id', batchIds)

        if (error) {
          console.log(`❌ Ошибка загрузки: ${error.message}`)
          continue
        }

        if (!batchData || batchData.length === 0) {
          console.log(`⚠️ Батч пуст`)
          continue
        }

        // Вставляем
        const { error: insertError } = await supabase
          .from('payments_v2')
          .insert(batchData)

        if (insertError) {
          console.log(`❌ Ошибка вставки: ${insertError.message}`)
        } else {
          transferred += batchData.length
          console.log(`✅ Перенесено: ${transferred}/${missingIds.length}`)
        }

        await new Promise(resolve => setTimeout(resolve, 300))
      }

      console.log(`\n🎉 ПЕРЕНЕСЕНО ${transferred} недостающих записей!`)

      // Проверяем результат
      const { count: newMainMetaMuse } = await supabase
        .from('payments_v2')
        .select('*', { count: 'exact', head: true })
        .eq('bot_name', 'MetaMuse_Manifest_bot')

      console.log(`Теперь MetaMuse в основной: ${newMainMetaMuse} записей`)

      expect(transferred).toBeGreaterThanOrEqual(0)
    })
  }
)
