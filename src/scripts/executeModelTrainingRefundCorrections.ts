import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import fs from 'fs'

// Цвета для консоли
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m',
  bright: '\x1b[1m',
}

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

async function displayCriticalWarning() {
  console.log(colors.red + colors.bright)
  console.log(
    '╔══════════════════════════════════════════════════════════════════════╗'
  )
  console.log(
    '║                         🚨 КРИТИЧЕСКОЕ ПРЕДУПРЕЖДЕНИЕ 🚨                ║'
  )
  console.log(
    '╠══════════════════════════════════════════════════════════════════════╣'
  )
  console.log(
    '║                                                                      ║'
  )
  console.log(
    '║  ВЫ СОБИРАЕТЕСЬ ВЫПОЛНИТЬ НЕОБРАТИМЫЕ ФИНАНСОВЫЕ ОПЕРАЦИИ!          ║'
  )
  console.log(
    '║                                                                      ║'
  )
  console.log(
    '║  💰 Общая сумма коррекции: 107,752.33⭐                             ║'
  )
  console.log(
    '║  👥 Затронуто пользователей: 2                                      ║'
  )
  console.log(
    '║  🔄 Операций: 4 корректирующих транзакции                           ║'
  )
  console.log(
    '║                                                                      ║'
  )
  console.log(
    '║  ⚠️  ЭТИ ДЕЙСТВИЯ НЕЛЬЗЯ ОТМЕНИТЬ АВТОМАТИЧЕСКИ!                    ║'
  )
  console.log(
    '║  ⚠️  ДЕНЬГИ БУДУТ СПИСАНЫ С РЕАЛЬНЫХ БАЛАНСОВ ПОЛЬЗОВАТЕЛЕЙ!       ║'
  )
  console.log(
    '║                                                                      ║'
  )
  console.log(
    '╚══════════════════════════════════════════════════════════════════════╝'
  )
  console.log(colors.reset)
}

async function showCorrectionDetails(corrections: CorrectionTransaction[]) {
  console.log(colors.cyan + '\n📋 ДЕТАЛИЗАЦИЯ КОРРЕКЦИЙ:' + colors.reset)
  console.log('='.repeat(70))

  let totalCorrection = 0

  for (let i = 0; i < corrections.length; i++) {
    const correction = corrections[i]
    const telegramId = correction.telegram_id.toString()
    totalCorrection += Math.abs(correction.stars)

    // Получаем информацию о пользователе
    const { data: userInfo } = await supabase
      .from('users')
      .select('first_name, last_name')
      .eq('telegram_id', telegramId)
      .single()

    const userName = userInfo
      ? `${userInfo.first_name || ''} ${userInfo.last_name || ''}`.trim()
      : 'Неизвестно'

    console.log(
      `\n${colors.yellow}${i + 1}. ${userName} (${telegramId})${colors.reset}`
    )
    console.log(
      `   💸 Списание: ${colors.red}${Math.abs(correction.stars)}⭐${colors.reset}`
    )
    console.log(`   📝 Причина: ${correction.description}`)
    console.log(`   🔧 Тип: ${correction.type} | ${correction.service_type}`)
  }

  console.log(
    `\n${colors.bright}💰 ИТОГО К СПИСАНИЮ: ${colors.red}${totalCorrection}⭐${colors.reset}`
  )
}

async function confirmExecution(): Promise<boolean> {
  console.log(colors.yellow + '\n🤔 ПОДТВЕРЖДЕНИЕ ВЫПОЛНЕНИЯ:' + colors.reset)
  console.log('-'.repeat(50))

  // Эмуляция интерактивного ввода (в реальном проекте используйте readline)
  console.log(
    'Для подтверждения выполнения коррекций, выполните следующие шаги:'
  )
  console.log('')
  console.log('1. 📋 Изучите MODELO_TRAINING_REFUND_ANOMALY_ANALYSIS.md')
  console.log('2. ✅ Убедитесь в корректности всех данных')
  console.log('3. 💾 Проверьте наличие резервной копии')
  console.log('4. 🔧 Раскомментируйте строку EXECUTE_CORRECTIONS = true в коде')
  console.log('')

  // Защитный флаг - ДОЛЖЕН быть false в продакшене
  const EXECUTE_CORRECTIONS = false // ⚠️ ИЗМЕНИТЬ НА true ТОЛЬКО ПОСЛЕ ПОЛНОГО ПОНИМАНИЯ ПОСЛЕДСТВИЙ!

  if (!EXECUTE_CORRECTIONS) {
    console.log(
      colors.red +
        '❌ ВЫПОЛНЕНИЕ ЗАБЛОКИРОВАНО: EXECUTE_CORRECTIONS = false' +
        colors.reset
    )
    console.log(
      colors.yellow +
        '💡 Для разблокировки измените EXECUTE_CORRECTIONS на true в коде скрипта' +
        colors.reset
    )
    return false
  }

  return true
}

async function executeCorrections(
  corrections: CorrectionTransaction[]
): Promise<{
  successful: number
  failed: number
  errors: string[]
  details: any[]
}> {
  const results = {
    successful: 0,
    failed: 0,
    errors: [] as string[],
    details: [] as any[],
  }

  console.log(
    colors.green + '\n🚀 НАЧИНАЕМ ПРИМЕНЕНИЕ КОРРЕКЦИЙ...' + colors.reset
  )
  console.log('='.repeat(60))

  for (let i = 0; i < corrections.length; i++) {
    const correction = corrections[i]
    const telegramId = correction.telegram_id.toString()

    console.log(
      `\n${colors.cyan}[${i + 1}/${corrections.length}] Пользователь ${telegramId}${colors.reset}`
    )

    try {
      // Получаем баланс ДО коррекции
      const balanceBefore = await getUserBalance(telegramId)

      // Применяем коррекцию
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
        console.log(`${colors.red}❌ Ошибка: ${error.message}${colors.reset}`)
        results.failed++
        results.errors.push(`${telegramId}: ${error.message}`)
        continue
      }

      // Получаем баланс ПОСЛЕ коррекции
      const balanceAfter = await getUserBalance(telegramId)

      console.log(
        `${colors.green}✅ Применено: ${Math.abs(correction.stars)}⭐${colors.reset}`
      )
      console.log(`   📊 Баланс: ${balanceBefore}⭐ → ${balanceAfter}⭐`)

      results.successful++
      results.details.push({
        telegram_id: telegramId,
        correction_amount: Math.abs(correction.stars),
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        transaction_id: data[0]?.id,
        timestamp: new Date().toISOString(),
      })

      // Пауза между операциями для безопасности
      await new Promise(resolve => setTimeout(resolve, 1000))
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Неизвестная ошибка'
      console.log(
        `${colors.red}❌ Критическая ошибка: ${errorMessage}${colors.reset}`
      )
      results.failed++
      results.errors.push(`${telegramId}: ${errorMessage}`)
    }
  }

  return results
}

async function saveExecutionReport(
  results: any,
  corrections: CorrectionTransaction[]
) {
  const report = {
    execution_timestamp: new Date().toISOString(),
    status: results.failed === 0 ? 'SUCCESS' : 'PARTIAL_SUCCESS',
    summary: {
      total_corrections: corrections.length,
      successful: results.successful,
      failed: results.failed,
      total_amount_corrected: corrections.reduce(
        (sum, c) => sum + Math.abs(c.stars),
        0
      ),
    },
    details: results.details,
    errors: results.errors,
    corrections_applied: corrections.map(c => ({
      telegram_id: c.telegram_id,
      amount: Math.abs(c.stars),
      description: c.description,
      operation_id: c.operation_id,
    })),
  }

  const fileName = `model_training_corrections_execution_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  fs.writeFileSync(fileName, JSON.stringify(report, null, 2))

  console.log(
    `\n${colors.green}💾 Отчет о выполнении сохранен: ${fileName}${colors.reset}`
  )
  return fileName
}

async function main() {
  try {
    console.clear()
    console.log(colors.bright + colors.blue)
    console.log(
      '╔════════════════════════════════════════════════════════════════════════╗'
    )
    console.log(
      '║                   ПРИМЕНЕНИЕ КОРРЕКЦИЙ АНОМАЛИЙ                        ║'
    )
    console.log(
      '║              Возвраты за тренировку моделей - ИСПРАВЛЕНИЕ              ║'
    )
    console.log(
      '╚════════════════════════════════════════════════════════════════════════╝'
    )
    console.log(colors.reset)

    // 1. Загружаем коррекции
    const corrections = await loadCorrections()
    console.log(`📋 Загружено ${corrections.length} корректирующих транзакций`)

    // 2. Показываем критическое предупреждение
    await displayCriticalWarning()

    // 3. Показываем детализацию
    await showCorrectionDetails(corrections)

    // 4. Получаем подтверждение
    const confirmed = await confirmExecution()

    if (!confirmed) {
      console.log(colors.yellow + '\n⚠️ ВЫПОЛНЕНИЕ ОТМЕНЕНО' + colors.reset)
      console.log('Коррекции НЕ были применены. Для применения:')
      console.log('1. Внимательно изучите анализ аномалий')
      console.log('2. Измените EXECUTE_CORRECTIONS на true в коде')
      console.log('3. Запустите скрипт повторно')
      return
    }

    // 5. Выполняем коррекции
    console.log(
      colors.bright +
        '\n🎯 ПОДТВЕРЖДЕНИЕ ПОЛУЧЕНО. НАЧИНАЕМ ВЫПОЛНЕНИЕ...' +
        colors.reset
    )

    const results = await executeCorrections(corrections)

    // 6. Показываем итоги
    console.log(colors.bright + '\n📊 ИТОГИ ВЫПОЛНЕНИЯ:' + colors.reset)
    console.log('='.repeat(50))
    console.log(
      `✅ Успешно: ${colors.green}${results.successful}${colors.reset}`
    )
    console.log(`❌ Ошибок: ${colors.red}${results.failed}${colors.reset}`)

    if (results.errors.length > 0) {
      console.log(`\n${colors.red}🚨 ОШИБКИ:${colors.reset}`)
      results.errors.forEach(error => console.log(`   • ${error}`))
    }

    // 7. Сохраняем отчет
    const reportFile = await saveExecutionReport(results, corrections)

    // 8. Финальное сообщение
    if (results.failed === 0) {
      console.log(
        colors.green +
          colors.bright +
          '\n🎉 ВСЕ КОРРЕКЦИИ УСПЕШНО ПРИМЕНЕНЫ!' +
          colors.reset
      )
      console.log('Аномалия возвратов за тренировку моделей исправлена.')
    } else {
      console.log(
        colors.yellow + '\n⚠️ КОРРЕКЦИИ ПРИМЕНЕНЫ ЧАСТИЧНО' + colors.reset
      )
      console.log('Некоторые операции завершились с ошибками. Проверьте отчет.')
    }

    console.log(`\n📋 Полный отчет: ${reportFile}`)
    console.log(`💾 Резервная копия: backup_before_corrections_*.json`)
  } catch (error) {
    console.error(colors.red + '\n💥 КРИТИЧЕСКАЯ ОШИБКА:', error, colors.reset)
    console.log('\n🆘 РЕКОМЕНДУЕМЫЕ ДЕЙСТВИЯ:')
    console.log('1. Проверьте состояние базы данных')
    console.log('2. Убедитесь в целостности резервной копии')
    console.log('3. Обратитесь к техническому администратору')
  }
}

// Запуск только если скрипт вызван напрямую
if (require.main === module) {
  main()
}

export { executeCorrections, loadCorrections }
