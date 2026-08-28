/**
 * ТЕСТ: Точные цифры без фильтров и лимитов
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

describe.skipIf(!HAS_INFISICAL)('MetaMuse Exact Numbers', () => {
  test('Точные цифры из backup без лимитов', async () => {
    console.log('\n🎯 ТОЧНЫЕ ЦИФРЫ ПО METAMUSE_MANIFEST_BOT ИЗ BACKUP')
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

      // RUB доходы БЕЗ ФИЛЬТРОВ
      console.log('📊 RUB доходы (все, без фильтров):')
      console.log('-'.repeat(80))

      const { data: rubIncomeAll, error: rubError } = await supabase
        .from('payments_v2_backup')
        .select('*')
        .eq('bot_name', 'MetaMuse_Manifest_bot')
        .eq('currency', 'RUB')
        .eq('type', 'MONEY_INCOME')

      if (rubError) throw rubError

      console.log(`Всего RUB MONEY_INCOME: ${rubIncomeAll.length} транзакций`)

      const rubIncomeWithAmount = rubIncomeAll.filter(
        tx => parseFloat(tx.amount as any) > 0
      )
      const rubIncomeSum = rubIncomeWithAmount.reduce(
        (sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0),
        0
      )

      console.log(
        `С положительной суммой: ${rubIncomeWithAmount.length} транзакций`
      )
      console.log(`Сумма: ${Math.round(rubIncomeSum).toLocaleString()}₽`)

      const rubZeroAmount = rubIncomeAll.filter(
        tx => parseFloat(tx.amount as any) === 0
      )
      if (rubZeroAmount.length > 0) {
        console.log(`С нулевой суммой: ${rubZeroAmount.length} транзакций`)
      }

      // STARS доходы БЕЗ ФИЛЬТРОВ
      console.log('\n\n📊 STARS доходы (все, без фильтров):')
      console.log('-'.repeat(80))

      const { data: starsIncomeAll, error: starsError } = await supabase
        .from('payments_v2_backup')
        .select('*')
        .eq('bot_name', 'MetaMuse_Manifest_bot')
        .eq('currency', 'STARS')
        .eq('type', 'MONEY_INCOME')

      if (starsError) throw starsError

      console.log(
        `Всего STARS MONEY_INCOME: ${starsIncomeAll.length} транзакций`
      )

      const starsIncomeWithAmount = starsIncomeAll.filter(
        tx => parseFloat(tx.amount as any) > 0
      )
      const starsIncomeSum = starsIncomeWithAmount.reduce(
        (sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0),
        0
      )

      console.log(
        `С положительной суммой: ${starsIncomeWithAmount.length} транзакций`
      )
      console.log(`Сумма: ${Math.round(starsIncomeSum).toLocaleString()}⭐`)

      const starsZeroAmount = starsIncomeAll.filter(
        tx => parseFloat(tx.amount as any) === 0
      )
      if (starsZeroAmount.length > 0) {
        console.log(`С нулевой суммой: ${starsZeroAmount.length} транзакций`)
        starsZeroAmount.forEach((tx, i) => {
          console.log(`   ${i + 1}. ${tx.description || 'без описания'}`)
        })
      }

      // STARS расходы БЕЗ ФИЛЬТРОВ
      console.log('\n\n📊 STARS расходы (все, без фильтров):')
      console.log('-'.repeat(80))

      const { data: starsOutcomeAll, error: outcomeError } = await supabase
        .from('payments_v2_backup')
        .select('*')
        .eq('bot_name', 'MetaMuse_Manifest_bot')
        .eq('currency', 'STARS')
        .eq('type', 'MONEY_OUTCOME')

      if (outcomeError) throw outcomeError

      console.log(
        `Всего STARS MONEY_OUTCOME: ${starsOutcomeAll.length} транзакций`
      )

      const starsOutcomeSum = starsOutcomeAll.reduce(
        (sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0),
        0
      )
      console.log(`Сумма: ${Math.round(starsOutcomeSum).toLocaleString()}⭐`)

      // ИТОГОВЫЕ ЦИФРЫ
      console.log('\n' + '='.repeat(80))
      console.log('💎 ТОЧНЫЕ ИТОГОВЫЕ ЦИФРЫ (ИЗ BACKUP):')
      console.log('='.repeat(80))
      console.log(
        `\n1️⃣ РАСХОДЫ (STARS): ${Math.round(starsOutcomeSum).toLocaleString()}⭐`
      )
      console.log(`   Транзакции: ${starsOutcomeAll.length}`)
      console.log(
        `\n2️⃣ ДОХОДЫ В РУБЛЯХ: ${Math.round(rubIncomeSum).toLocaleString()}₽`
      )
      console.log(
        `   Транзакции: ${rubIncomeWithAmount.length} (из ${rubIncomeAll.length})`
      )
      console.log(
        `\n3️⃣ ДОХОДЫ В ЗВЕЗДАХ: ${Math.round(starsIncomeSum).toLocaleString()}⭐`
      )
      console.log(
        `   Транзакции: ${starsIncomeWithAmount.length} (из ${starsIncomeAll.length})`
      )
      console.log('='.repeat(80))

      console.log('\n📊 ДЕТАЛИ:')
      console.log(`- RUB транзакций с нулевой суммой: ${rubZeroAmount.length}`)
      console.log(
        `- STARS транзакций с нулевой суммой: ${starsZeroAmount.length}`
      )

      expect(rubIncomeAll).toBeDefined()
      expect(starsIncomeAll).toBeDefined()
      expect(starsOutcomeAll).toBeDefined()
    } catch (error) {
      console.error('\n❌ Ошибка:', error)
      throw error
    }
  })
})
