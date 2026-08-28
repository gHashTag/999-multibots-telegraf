/**
 * ТЕСТ: Полная проверка MetaMuse_Manifest_bot из LIVE Supabase
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

describe.skipIf(!HAS_INFISICAL)(
  'MetaMuse_Manifest_bot Complete Verification',
  () => {
    test('Полная проверка всех доходов и расходов', async () => {
      console.log('\n🔍 ПОЛНАЯ ПРОВЕРКА METAMUSE_MANIFEST_BOT ИЗ LIVE SUPABASE')
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

        // 1. RUB доходы
        console.log('📊 1. RUB доходы (MONEY_INCOME):')
        console.log('-'.repeat(80))

        const { data: rubIncome, error: rubError } = await supabase
          .from('payments_v2')
          .select('*')
          .eq('bot_name', 'MetaMuse_Manifest_bot')
          .eq('currency', 'RUB')
          .eq('type', 'MONEY_INCOME')
          .gt('amount', 0)
          .order('created_at', { ascending: false })

        if (rubError) throw rubError

        console.log(`Найдено: ${rubIncome.length} транзакций`)

        if (rubIncome.length > 0) {
          const totalRubSum = rubIncome.reduce(
            (sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0),
            0
          )
          console.log(
            `Общая сумма: ${Math.round(totalRubSum).toLocaleString()}₽`
          )

          console.log('\n💰 ТОП-10 RUB ДОХОДОВ:')
          rubIncome.slice(0, 10).forEach((tx, i) => {
            const amount = Math.abs(parseFloat(tx.amount as any) || 0)
            const date = new Date(tx.created_at as any)
            const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`

            console.log(
              `\n   ${i + 1}. ${amount.toLocaleString()}₽ | ${dateStr}`
            )
            console.log(
              `      User: ${tx.telegram_id} | ${tx.payment_method || 'unknown'}`
            )
            console.log(`      ${tx.description || 'без описания'}`)
          })
        }

        // 2. STARS доходы
        console.log('\n\n📊 2. STARS доходы (MONEY_INCOME):')
        console.log('-'.repeat(80))

        const { data: starsIncome, error: starsError } = await supabase
          .from('payments_v2')
          .select('*')
          .eq('bot_name', 'MetaMuse_Manifest_bot')
          .eq('currency', 'STARS')
          .eq('type', 'MONEY_INCOME')
          .gt('amount', 0)
          .order('created_at', { ascending: false })

        if (starsError) throw starsError

        console.log(`Найдено: ${starsIncome.length} транзакций`)

        const totalStarsIncomeSum = starsIncome.reduce(
          (sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0),
          0
        )
        console.log(
          `Общая сумма: ${Math.round(totalStarsIncomeSum).toLocaleString()}⭐`
        )

        if (starsIncome.length > 0) {
          starsIncome.slice(0, 5).forEach((tx, i) => {
            const amount = Math.abs(parseFloat(tx.amount as any) || 0)
            const date = new Date(tx.created_at as any)
            const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`

            console.log(
              `\n   ${i + 1}. ${amount.toLocaleString()}⭐ | ${dateStr}`
            )
            console.log(`      ${tx.description || 'без описания'}`)
          })
        } else {
          console.log('   ❌ STARS доходов НЕТ!')
        }

        // 3. STARS расходы
        console.log('\n\n📊 3. STARS расходы (MONEY_OUTCOME):')
        console.log('-'.repeat(80))

        const { data: starsOutcome, error: outcomeError } = await supabase
          .from('payments_v2')
          .select('*')
          .eq('bot_name', 'MetaMuse_Manifest_bot')
          .eq('currency', 'STARS')
          .eq('type', 'MONEY_OUTCOME')
          .order('created_at', { ascending: false })

        if (outcomeError) throw outcomeError

        console.log(`Найдено: ${starsOutcome.length} транзакций`)

        const totalStarsOutcomeSum = starsOutcome.reduce(
          (sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0),
          0
        )
        console.log(
          `Общая сумма: ${Math.round(totalStarsOutcomeSum).toLocaleString()}⭐`
        )

        // 4. ИТОГОВЫЕ ЦИФРЫ
        console.log('\n' + '='.repeat(80))
        console.log('💎 ФИНАЛЬНЫЕ ТРИ ЦИФРЫ (LIVE SUPABASE):')
        console.log('='.repeat(80))
        console.log(
          `1️⃣ РАСХОДЫ (STARS): ${Math.round(totalStarsOutcomeSum).toLocaleString()}⭐`
        )
        console.log(
          `2️⃣ ДОХОДЫ В РУБЛЯХ: ${Math.round(rubIncome.reduce((s, tx) => s + Math.abs(parseFloat(tx.amount as any) || 0), 0)).toLocaleString()}₽`
        )
        console.log(
          `3️⃣ ДОХОДЫ В ЗВЁЗДАХ: ${Math.round(totalStarsIncomeSum).toLocaleString()}⭐`
        )
        console.log('='.repeat(80))

        expect(rubIncome).toBeDefined()
        expect(starsIncome).toBeDefined()
        expect(starsOutcome).toBeDefined()
      } catch (error) {
        console.error('\n❌ Ошибка:', error)
        throw error
      }
    })
  }
)
