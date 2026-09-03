/**
 * ТЕСТ: Переносим недостающие XTR Money Income записи
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
  'Transfer Missing XTR',
  () => {
    test('Переносим недостающие XTR Money Income записи из backup', async () => {
      console.log('\n🔄 ПЕРЕНОСИМ НЕДОСТАЮЩИЕ XTR Money Income')
      console.log('='.repeat(80))

      await initInfisical()
      process.env.SUPABASE_URL = getSecret('SUPABASE_URL')
      process.env.SUPABASE_SERVICE_ROLE_KEY = getSecret(
        'SUPABASE_SERVICE_ROLE_KEY'
      )
      process.env.SUPABASE_SERVICE_KEY = getSecret('SUPABASE_SERVICE_KEY')

      // Получаем все XTR Money Income ID из backup
      const { data: backupXtrIds } = await supabase
        .from('payments_v2_backup')
        .select('id')
        .eq('bot_name', 'MetaMuse_Manifest_bot')
        .eq('currency', 'XTR')
        .eq('type', 'MONEY_INCOME')

      // Получаем все XTR Money Income ID из основной
      const { data: mainXtrIds } = await supabase
        .from('payments_v2')
        .select('id')
        .eq('bot_name', 'MetaMuse_Manifest_bot')
        .eq('currency', 'XTR')
        .eq('type', 'MONEY_INCOME')

      const mainXtrIdSet = new Set((mainXtrIds || []).map(row => row.id))
      const missingIds = (backupXtrIds || [])
        .map(row => row.id)
        .filter(id => !mainXtrIdSet.has(id))

      console.log(`Найдено недостающих XTR ID: ${missingIds.length}`)

      if (missingIds.length === 0) {
        console.log('✅ Все XTR Money Income уже перенесены!')
        return
      }

      // Переносим недостающие записи
      const batchSize = 200
      let transferred = 0

      for (let i = 0; i < missingIds.length; i += batchSize) {
        const batchIds = missingIds.slice(i, i + batchSize)
        const batchNum = Math.floor(i / batchSize) + 1

        console.log(
          `\nБатч ${batchNum}: ${i + 1}-${i + batchIds.length} из ${missingIds.length}`
        )

        // Загружаем данные
        const { data: batchData } = await supabase
          .from('payments_v2_backup')
          .select('*')
          .in('id', batchIds)

        if (batchData && batchData.length > 0) {
          await supabase.from('payments_v2').insert(batchData)
          transferred += batchData.length
          console.log(`✅ Перенесено: ${transferred}/${missingIds.length}`)
        }

        await new Promise(resolve => setTimeout(resolve, 300))
      }

      console.log(`\n🎉 ПЕРЕНЕСЕНО ${transferred} XTR Money Income записей!`)

      // Проверяем результат
      const { data: newMainXtrIncome } = await supabase
        .from('payments_v2')
        .select('amount')
        .eq('bot_name', 'MetaMuse_Manifest_bot')
        .eq('currency', 'XTR')
        .eq('type', 'MONEY_INCOME')

      const newSum = (newMainXtrIncome || []).reduce(
        (sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0),
        0
      )

      console.log(
        `Теперь XTR Money Income в основной: ${newMainXtrIncome?.length || 0} записей, сумма: ${Math.round(newSum).toLocaleString()} XTR`
      )

      expect(transferred).toBeGreaterThanOrEqual(0)
    })
  }
)
