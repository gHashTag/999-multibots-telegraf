import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import fs from 'fs'

interface CorrectionTransaction {
  telegram_id: number
  amount: number
  stars: number
  type: string
  description: string
  service_type: string
  operation_id: string
  bot_name: string
  language: string
  payment_method: string
  is_system_payment: boolean
  status: string
  category: string
  metadata: any
}

async function loadCorrections(): Promise<CorrectionTransaction[]> {
  try {
    const reportData = JSON.parse(
      fs.readFileSync('model_training_refund_anomalies_report.json', 'utf8')
    )
    return reportData.fixTransactions
  } catch (error) {
    console.error('❌ Ошибка чтения файла отчета:', error)
    throw new Error('Файл отчета не найден. Сначала запустите анализ аномалий.')
  }
}

async function getCurrentBalances(
  telegramIds: string[]
): Promise<Map<string, number>> {
  const balances = new Map<string, number>()

  for (const telegramId of telegramIds) {
    try {
      // Получаем информацию о пользователе
      const { data: userInfo, error: userError } = await supabase
        .from('users')
        .select('first_name, last_name, username')
        .eq('telegram_id', telegramId)
        .single()

      if (userError) {
        console.error(
          `❌ Ошибка получения пользователя ${telegramId}:`,
          userError
        )
        balances.set(telegramId, 0)
        continue
      }

      // Получаем баланс через функцию
      const balance = await getUserBalance(telegramId)
      balances.set(telegramId, balance)

      const userName = userInfo
        ? `${userInfo.first_name || ''} ${userInfo.last_name || ''}`.trim()
        : 'Неизвестно'

      console.log(`💰 ${userName} (${telegramId}): ${balance}⭐`)
    } catch (error) {
      console.error(`❌ Ошибка для пользователя ${telegramId}:`, error)
      balances.set(telegramId, 0)
    }
  }

  return balances
}

async function applyCorrections(
  corrections: CorrectionTransaction[],
  dryRun: boolean = true
): Promise<{
  successful: number
  failed: number
  errors: string[]
}> {
  const results = {
    successful: 0,
    failed: 0,
    errors: [] as string[],
  }

  console.log(`🔧 ${dryRun ? 'ТЕСТОВЫЙ РЕЖИМ' : 'ПРИМЕНЕНИЕ КОРРЕКЦИЙ'}`)
  console.log('='.repeat(60))

  for (let i = 0; i < corrections.length; i++) {
    const correction = corrections[i]
    const telegramId = correction.telegram_id.toString()

    console.log(
      `\n${i + 1}/${corrections.length} 👤 Пользователь ${telegramId}`
    )
    console.log(`💸 Коррекция: ${Math.abs(correction.stars)}⭐`)
    console.log(`📝 Описание: ${correction.description}`)

    if (dryRun) {
      console.log('✅ ТЕСТ: Коррекция подготовлена (не применена)')
      results.successful++
      continue
    }

    try {
      // Применяем коррекцию через payments_v2
      const { data, error } = await supabase
        .from('payments_v2')
        .insert({
          telegram_id: correction.telegram_id,
          amount: correction.amount,
          description: correction.description,
          stars: correction.stars,
          currency: 'stars',
          status: correction.status,
          type: correction.type,
          service_type: correction.service_type,
          operation_id: correction.operation_id,
          bot_name: correction.bot_name,
          language: correction.language,
          payment_method: correction.payment_method,
          is_system_payment: correction.is_system_payment,
          category: correction.category,
          metadata: correction.metadata,
          payment_date: new Date().toISOString(),
          created_at: new Date().toISOString(),
        })
        .select()

      if (error) {
        console.error('❌ Ошибка применения коррекции:', error.message)
        results.failed++
        results.errors.push(`${telegramId}: ${error.message}`)
        continue
      }

      console.log('✅ Коррекция успешно применена в базу данных')
      results.successful++
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Неизвестная ошибка'
      console.error('❌ Критическая ошибка:', errorMessage)
      results.failed++
      results.errors.push(`${telegramId}: ${errorMessage}`)
    }
  }

  return results
}

async function createBackup(): Promise<void> {
  console.log('💾 Создание резервной копии данных пользователей...')

  const reportData = JSON.parse(
    fs.readFileSync('model_training_refund_anomalies_report.json', 'utf8')
  )
  const telegramIds = [
    ...new Set(reportData.anomalies.map((a: any) => a.telegramId)),
  ]

  const backupData = {
    timestamp: new Date().toISOString(),
    description: 'Backup before model training refund corrections',
    users: [] as any[],
  }

  for (const telegramId of telegramIds) {
    try {
      // Получаем данные пользователя
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', telegramId)
        .single()

      if (userError) {
        console.error(
          `❌ Ошибка получения данных пользователя ${telegramId}:`,
          userError
        )
        continue
      }

      // Получаем баланс пользователя
      const balance = await getUserBalance(String(telegramId))

      // Получаем последние транзакции пользователя
      const { data: transactions, error: transError } = await supabase
        .from('payments_v2')
        .select('*')
        .eq('telegram_id', parseInt(String(telegramId)))
        .order('created_at', { ascending: false })
        .limit(50)

      if (transError) {
        console.error(
          `❌ Ошибка получения транзакций пользователя ${telegramId}:`,
          transError
        )
      }

      backupData.users.push({
        telegram_id: telegramId,
        user_data: userData,
        current_balance: balance,
        recent_transactions: transactions || [],
      })
    } catch (error) {
      console.error(
        `❌ Ошибка создания резервной копии для ${telegramId}:`,
        error
      )
    }
  }

  // Сохраняем резервную копию
  const backupFileName = `backup_before_corrections_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  fs.writeFileSync(backupFileName, JSON.stringify(backupData, null, 2))
  console.log(`✅ Резервная копия сохранена: ${backupFileName}`)
}

async function main() {
  try {
    console.log('🔧 СИСТЕМА КОРРЕКЦИИ АНОМАЛИЙ ВОЗВРАТОВ ЗА ТРЕНИРОВКУ МОДЕЛЕЙ')
    console.log('='.repeat(70))

    // 1. Загружаем коррекции
    const corrections = await loadCorrections()
    console.log(`📋 Загружено ${corrections.length} корректирующих транзакций`)

    // 2. Получаем уникальные telegram_id
    const telegramIds = [
      ...new Set(corrections.map(c => c.telegram_id.toString())),
    ]
    console.log(`👥 Затронуто пользователей: ${telegramIds.length}`)

    // 3. Показываем текущие балансы
    console.log('\n💰 ТЕКУЩИЕ БАЛАНСЫ ПОЛЬЗОВАТЕЛЕЙ:')
    console.log('-'.repeat(50))
    const currentBalances = await getCurrentBalances(telegramIds)

    // 4. Подсчитываем итоговую коррекцию
    const totalCorrection = corrections.reduce(
      (sum, c) => sum + Math.abs(c.stars),
      0
    )
    console.log(`\n💸 Общая сумма коррекции: ${totalCorrection}⭐`)

    // 5. Проверяем, хватит ли балансов
    console.log('\n⚖️ ПРОВЕРКА ДОСТАТОЧНОСТИ БАЛАНСОВ:')
    console.log('-'.repeat(50))
    let insufficientBalance = false

    for (const correction of corrections) {
      const telegramId = correction.telegram_id.toString()
      const currentBalance = currentBalances.get(telegramId) || 0
      const correctionAmount = Math.abs(correction.stars)

      if (currentBalance < correctionAmount) {
        console.log(
          `❌ ${telegramId}: Баланс ${currentBalance}⭐ < Коррекция ${correctionAmount}⭐`
        )
        insufficientBalance = true
      } else {
        console.log(
          `✅ ${telegramId}: Баланс ${currentBalance}⭐ >= Коррекция ${correctionAmount}⭐`
        )
      }
    }

    if (insufficientBalance) {
      console.log(
        '\n⚠️ ВНИМАНИЕ: У некоторых пользователей недостаточно средств для коррекции!'
      )
      console.log(
        '💡 Рекомендуется либо уменьшить коррекцию, либо добавить средства этим пользователям.'
      )
      console.log(
        '💭 Однако, если аномалия была в переплате, то баланс может быть правильным, а коррекция - справедливой.'
      )
    }

    // 6. Тестовый прогон
    console.log('\n🧪 ТЕСТОВЫЙ ПРОГОН:')
    const testResults = await applyCorrections(corrections, true)
    console.log(`✅ Успешно: ${testResults.successful}`)
    console.log(`❌ Ошибок: ${testResults.failed}`)

    // 7. Предлагаем варианты действий
    console.log('\n🎯 СЛЕДУЮЩИЕ ДЕЙСТВИЯ:')
    console.log('='.repeat(50))
    console.log('1. ✅ Создать резервную копию (рекомендуется)')
    console.log('2. 🔧 Применить коррекции (ОСТОРОЖНО!)')
    console.log('3. 📊 Повторить анализ')
    console.log('4. ❌ Отменить операцию')

    console.log(
      '\n⚠️ ВАЖНО: Это реальные транзакции, которые повлияют на балансы пользователей!'
    )
    console.log('📋 Для применения создайте отдельный скрипт с подтверждением.')

    // 8. Создаем резервную копию автоматически
    console.log('\n💾 Автоматическое создание резервной копии...')
    await createBackup()
  } catch (error) {
    console.error('💥 Критическая ошибка:', error)
  }
}

main()
