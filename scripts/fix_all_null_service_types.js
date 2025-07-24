const { supabase } = require('./dist/core/supabase/index.js')

async function fixAllNullServiceTypes() {
  console.log('🔍 Массовое исправление service_type для всех пользователей...')

  // Получаем все транзакции с null service_type
  const { data: transactions, error } = await supabase
    .from('payments_v2')
    .select('id, description, type, service_type, telegram_id')
    .eq('status', 'COMPLETED')
    .is('service_type', null)
    .order('id', { ascending: true })

  if (error) {
    console.error('Ошибка получения транзакций:', error)
    return
  }

  if (!transactions || transactions.length === 0) {
    console.log('Транзакции с null service_type не найдены')
    return
  }

  console.log(
    `📊 Найдено ${transactions.length} транзакций с null service_type`
  )

  let updatedCount = 0
  let batchSize = 10
  let currentBatch = 0

  for (let i = 0; i < transactions.length; i += batchSize) {
    const batch = transactions.slice(i, i + batchSize)
    currentBatch++

    console.log(
      `\n🔄 Обработка батча ${currentBatch}/${Math.ceil(transactions.length / batchSize)} (${batch.length} записей)`
    )

    for (const transaction of batch) {
      const desc = (transaction.description || '').toLowerCase()
      let newServiceType = null

      if (transaction.type === 'MONEY_INCOME') {
        // Доходы
        if (
          desc.includes('пополнение баланса') ||
          desc.includes('⭐️ пополнение')
        ) {
          newServiceType = 'top_up_balance'
        } else if (desc.includes('payment via telegram')) {
          newServiceType = 'top_up_balance'
        } else if (desc.includes('payment via robokassa')) {
          newServiceType = 'top_up_balance'
        } else if (desc.includes('возврат') || desc.includes('refund')) {
          newServiceType = 'refund_operation'
        } else if (
          desc.includes('активация подписки') ||
          desc.includes('subscription')
        ) {
          newServiceType = 'subscribe'
        } else if (
          desc.includes('system grant') ||
          desc.includes('system correction')
        ) {
          newServiceType = 'admin_topup'
        } else if (
          desc.includes('системное начисление') ||
          desc.includes('администратором')
        ) {
          newServiceType = 'admin_topup'
        } else if (desc.includes('миграция баланса')) {
          newServiceType = 'migration'
        } else if (desc.includes('техническое пополнение')) {
          newServiceType = 'admin_topup'
        } else if (desc.includes('promo bonus') || desc.includes('🎁')) {
          newServiceType = 'admin_topup'
        } else {
          newServiceType = 'top_up_balance' // По умолчанию для доходов
        }
      } else if (transaction.type === 'MONEY_OUTCOME') {
        // Расходы
        if (desc.includes('video generation')) {
          newServiceType = 'text_to_video'
        } else if (
          desc.includes('neuro photo') ||
          desc.includes('image generation')
        ) {
          newServiceType = 'neuro_photo'
        } else if (desc.includes('payment operation')) {
          newServiceType = 'payment_operation'
        } else if (
          desc.includes('image to prompt') ||
          desc.includes('анализ изображения')
        ) {
          newServiceType = 'image_to_prompt'
        } else if (
          desc.includes('lip sync') ||
          desc.includes('синхронизация губ')
        ) {
          newServiceType = 'lip_sync'
        } else if (
          desc.includes('digital avatar') ||
          desc.includes('цифровой аватар')
        ) {
          newServiceType = 'digital_avatar_body'
        } else {
          newServiceType = 'unknown_service' // Для неопознанных расходов
        }
      }

      if (newServiceType) {
        const { error: updateError } = await supabase
          .from('payments_v2')
          .update({ service_type: newServiceType })
          .eq('id', transaction.id)

        if (updateError) {
          console.error(
            `❌ Ошибка обновления ID ${transaction.id}:`,
            updateError
          )
        } else {
          updatedCount++
          if (updatedCount % 50 === 0) {
            console.log(
              `✅ Обновлено ${updatedCount}/${transactions.length} записей...`
            )
          }
        }
      }
    }

    // Небольшая пауза между батчами
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  console.log(`\n🎉 Массовое исправление завершено!`)
  console.log(
    `✅ Обновлено: ${updatedCount} из ${transactions.length} транзакций`
  )

  // Проверяем результат
  const { data: remainingNull, error: checkError } = await supabase
    .from('payments_v2')
    .select('id')
    .eq('status', 'COMPLETED')
    .is('service_type', null)

  if (!checkError && remainingNull) {
    console.log(
      `📊 Осталось записей с null service_type: ${remainingNull.length}`
    )
  }
}

// Запускаем исправление
fixAllNullServiceTypes()
  .then(() => {
    console.log('✅ Скрипт завершен')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Ошибка:', error)
    process.exit(1)
  })
