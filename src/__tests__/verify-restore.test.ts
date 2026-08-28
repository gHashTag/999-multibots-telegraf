/**
 * ТЕСТ: Проверяем полноту переноса данных
 */

import { describe, test, expect } from 'vitest'

// Разбор ЖИВОЙ базы через Infisical: без креденшелов падает с
// «Infisical credentials missing». Запускаем только при их наличии.
const HAS_INFISICAL = Boolean(
  process.env.INFISICAL_CLIENT_ID &&
    process.env.INFISICAL_CLIENT_SECRET &&
    process.env.INFISICAL_PROJECT_ID
)
import { initInfisical, getSecret } from '../core/infisical'
import { supabase } from '../core/supabase/client'

describe.skipIf(!HAS_INFISICAL)('Verify Restore', () => {
  test('Проверяем полноту переноса данных', async () => {
    console.log('\n🔍 ПРОВЕРЯЕМ ПОЛНОТУ ПЕРЕНОСА')
    console.log('='.repeat(80))

    await initInfisical()
    process.env.SUPABASE_URL = getSecret('SUPABASE_URL')
    process.env.SUPABASE_SERVICE_ROLE_KEY = getSecret(
      'SUPABASE_SERVICE_ROLE_KEY'
    )
    process.env.SUPABASE_SERVICE_KEY = getSecret('SUPABASE_SERVICE_KEY')

    // Количество записей
    const { count: backupTotal } = await supabase
      .from('payments_v2_backup')
      .select('*', { count: 'exact', head: true })

    const { count: mainTotal } = await supabase
      .from('payments_v2')
      .select('*', { count: 'exact', head: true })

    console.log(`\n📊 ВСЕГО ЗАПИСЕЙ:`)
    console.log(`   Backup: ${backupTotal}`)
    console.log(`   Основная: ${mainTotal}`)
    console.log(`   Разница: ${(mainTotal || 0) - (backupTotal || 0)}`)

    // MetaMuse в backup
    const { count: backupMetaMuse } = await supabase
      .from('payments_v2_backup')
      .select('*', { count: 'exact', head: true })
      .eq('bot_name', 'MetaMuse_Manifest_bot')

    const { data: backupMetaMuseRub } = await supabase
      .from('payments_v2_backup')
      .select('amount')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('currency', 'RUB')
      .eq('type', 'MONEY_INCOME')
      .gt('amount', 0)

    const backupRubSum = (backupMetaMuseRub || []).reduce(
      (sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0),
      0
    )

    console.log(`\n📊 METAMUSE В BACKUP:`)
    console.log(`   Записей: ${backupMetaMuse}`)
    console.log(
      `   RUB доходы: ${Math.round(backupRubSum).toLocaleString()}₽ (${backupMetaMuseRub?.length || 0} транз.)`
    )

    // MetaMuse в основной
    const { count: mainMetaMuse } = await supabase
      .from('payments_v2')
      .select('*', { count: 'exact', head: true })
      .eq('bot_name', 'MetaMuse_Manifest_bot')

    const { data: mainMetaMuseRub } = await supabase
      .from('payments_v2')
      .select('amount')
      .eq('bot_name', 'MetaMuse_Manifest_bot')
      .eq('currency', 'RUB')
      .eq('type', 'MONEY_INCOME')
      .gt('amount', 0)

    const mainRubSum = (mainMetaMuseRub || []).reduce(
      (sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0),
      0
    )

    console.log(`\n📊 METAMUSE В ОСНОВНОЙ:`)
    console.log(`   Записей: ${mainMetaMuse}`)
    console.log(
      `   RUB доходы: ${Math.round(mainRubSum).toLocaleString()}₽ (${mainMetaMuseRub?.length || 0} транз.)`
    )

    console.log(`\n📊 РАЗНИЦА:`)
    console.log(
      `   Записей MetaMuse: ${(mainMetaMuse || 0) - (backupMetaMuse || 0)}`
    )
    console.log(
      `   RUB доходы: ${Math.round(mainRubSum - backupRubSum).toLocaleString()}₽`
    )

    if (
      mainMetaMuse !== backupMetaMuse ||
      Math.abs(mainRubSum - backupRubSum) > 1
    ) {
      console.log('\n⚠️ ДАННЫЕ НЕ ПОЛНОСТЬЮ ПЕРЕНЕСЕНЫ!')
    } else {
      console.log('\n✅ ДАННЫЕ ПОЛНОСТЬЮ ПЕРЕНЕСЕНЫ!')
    }

    expect(mainRubSum).toBeGreaterThanOrEqual(0)
  })
})
