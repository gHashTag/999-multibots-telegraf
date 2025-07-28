import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

// Определяем коррекции для пользователя Ludmila K
const LUDMILA_CORRECTIONS = [
  {
    description:
      '🔧 Коррекция аномального возврата #1 (должно быть 220⭐, было 1453.19⭐)',
    amount: -1233.19, // Убираем переплату
    original_refund_amount: 1453.19,
    correct_refund_amount: 220,
    anomaly_date: '2025-07-27T17:20:25',
  },
  {
    description:
      '🔧 Коррекция аномального возврата #2 (должно быть 220⭐, было 2686.38⭐)',
    amount: -2466.38, // Убираем переплату
    original_refund_amount: 2686.38,
    correct_refund_amount: 220,
    anomaly_date: '2025-07-27T18:46:36',
  },
  {
    description:
      '🔧 Коррекция аномального возврата #3 (должно быть 220⭐, было 5152.76⭐)',
    amount: -4932.76, // Убираем переплату
    original_refund_amount: 5152.76,
    correct_refund_amount: 220,
    anomaly_date: '2025-07-27T19:15:34',
  },
]

const TELEGRAM_ID = 7007992081
const TOTAL_CORRECTION = -8632.33 // Общая сумма к списанию

async function fixLudmilaAnomalousRefunds(): Promise<void> {
  console.log('🔧 ИСПРАВЛЕНИЕ АНОМАЛЬНЫХ ВОЗВРАТОВ LUDMILA K')
  console.log('='.repeat(80))

  console.log(`👤 Пользователь: Ludmila K (${TELEGRAM_ID})`)
  console.log(`💸 Общая сумма коррекции: ${TOTAL_CORRECTION}⭐`)
  console.log(`📊 Количество корректировок: ${LUDMILA_CORRECTIONS.length}`)

  // 1. ВАЖНОЕ ПРИМЕЧАНИЕ О БАЛАНСЕ
  console.log('\n⚠️  ПРИМЕЧАНИЕ: Текущий баланс показывает 0⭐')
  console.log(
    'Это происходит из-за технических особенностей функции get_user_balance'
  )
  console.log(
    'Реальный баланс пользователя: 9,986.52⭐ (согласно детальному анализу)'
  )
  console.log('После коррекции баланс станет: 1,354.19⭐')

  // 2. Применяем каждую коррекцию
  console.log('\n🚀 НАЧИНАЕМ ПРИМЕНЕНИЕ КОРРЕКТИРОВОК...')

  for (let i = 0; i < LUDMILA_CORRECTIONS.length; i++) {
    const correction = LUDMILA_CORRECTIONS[i]
    console.log(`\n📝 КОРРЕКЦИЯ ${i + 1}/${LUDMILA_CORRECTIONS.length}:`)
    console.log(`  📅 Аномалия от: ${correction.anomaly_date}`)
    console.log(`  💰 Сумма коррекции: ${correction.amount}⭐`)
    console.log(`  📝 Описание: ${correction.description}`)

    try {
      const { data, error } = await supabase.from('payments_v2').insert({
        telegram_id: TELEGRAM_ID,
        amount: Math.abs(correction.amount),
        stars: Math.abs(correction.amount),
        type: 'MONEY_OUTCOME',
        description: correction.description,
        service_type: 'system_correction',
        operation_id: `correction_ludmila_${Date.now()}_${i}`,
        bot_name: 'system',
        language: 'ru',
        payment_method: 'System Correction',
        is_system_payment: true,
        status: 'COMPLETED',
        category: 'REAL', // Исправлено: используем REAL вместо CORRECTION
        metadata: {
          correction_type: 'anomalous_refund_fix',
          original_refund_amount: correction.original_refund_amount,
          correct_refund_amount: correction.correct_refund_amount,
          anomaly_date: correction.anomaly_date,
          correction_reason: 'Fix multiplied model training refund',
          processed_at: new Date().toISOString(),
          processed_by: 'НейроКодер',
        },
      })

      if (error) {
        console.error(`❌ Ошибка применения коррекции ${i + 1}:`, error)
        throw error
      }

      console.log(`✅ Коррекция ${i + 1} успешно применена`)

      // Небольшая пауза между коррекциями
      await new Promise(resolve => setTimeout(resolve, 100))
    } catch (error) {
      console.error(`💥 КРИТИЧЕСКАЯ ОШИБКА при коррекции ${i + 1}:`, error)
      return
    }
  }

  // 3. Создаем отчет
  console.log('\n📄 СОЗДАНИЕ ОТЧЕТА...')
  const report = {
    user: {
      telegram_id: TELEGRAM_ID,
      name: 'Ludmila K',
    },
    correction_summary: {
      corrections_applied: LUDMILA_CORRECTIONS.length,
      total_correction_amount: TOTAL_CORRECTION,
      balance_before_anomaly: 694.19, // Правильный баланс без аномалий
      balance_with_anomaly: 9986.52, // Баланс с аномалиями
      balance_after_correction: 1354.19, // Ожидаемый баланс после коррекции
      anomaly_amount: 9292.33,
    },
    anomalies_fixed: LUDMILA_CORRECTIONS.map((c, i) => ({
      correction_number: i + 1,
      anomaly_date: c.anomaly_date,
      original_refund: c.original_refund_amount,
      correct_refund: c.correct_refund_amount,
      correction_amount: c.amount,
      description: c.description,
    })),
    timestamp: new Date().toISOString(),
    status: 'COMPLETED',
  }

  // Сохраняем отчет
  const fs = require('fs')
  fs.writeFileSync(
    'ludmila_anomaly_correction_report.json',
    JSON.stringify(report, null, 2)
  )

  console.log('\n' + '='.repeat(80))
  console.log('✅ ВСЕ КОРРЕКЦИИ УСПЕШНО ПРИМЕНЕНЫ!')
  console.log(`📄 Отчет сохранен в: ludmila_anomaly_correction_report.json`)
  console.log(`🎯 Общая сумма корректировок: ${TOTAL_CORRECTION}⭐`)
  console.log(`💰 Ожидаемый баланс пользователя: 1,354.19⭐`)
  console.log(
    '🔍 Рекомендуется повторно проверить баланс пользователя после применения корректировок'
  )
}

// Запускаем исправление
console.log('🕉️ НАЧИНАЕМ ИСПРАВЛЕНИЕ АНОМАЛИИ ВОЗВРАТОВ ЗА ТРЕНИРОВКУ МОДЕЛЕЙ')
console.log('='.repeat(80))
fixLudmilaAnomalousRefunds().catch(console.error)
