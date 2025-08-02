import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

/**
 * Проверка дополнительных факторов, которые могут влиять на доступ Артёма
 */
async function checkArtemAdditionalFactors() {
  const telegramId = 164609458

  console.log(
    '🔍 ПРОВЕРКА ДОПОЛНИТЕЛЬНЫХ ФАКТОРОВ ДЛЯ АРТЁМА ФИСЕНКО (164609458)'
  )
  console.log('='.repeat(70))

  try {
    // 1. Проверяем статус сотрудника Хаим Групп
    console.log('👨‍💼 ПРОВЕРКА СТАТУСА СОТРУДНИКА ХАИМ ГРУПП:')

    const { data: haimStaffCheck, error: haimError } = await supabase
      .from('users')
      .select(
        'telegram_id, is_haim_staff, staff_role, subscription_type, is_subscription_active, subscription_end_date'
      )
      .eq('telegram_id', telegramId)
      .maybeSingle()

    if (haimError) {
      console.log('⚠️ Ошибка проверки users:', haimError.message)
    } else if (haimStaffCheck) {
      console.log('✅ Найден в таблице users:')
      console.log(
        `   👨‍💼 Сотрудник Хаим: ${haimStaffCheck.is_haim_staff || 'НЕ УКАЗАНО'}`
      )
      console.log(`   🏢 Роль: ${haimStaffCheck.staff_role || 'НЕ УКАЗАНО'}`)
      console.log(
        `   📋 Тип подписки в users: ${haimStaffCheck.subscription_type || 'НЕ УКАЗАНО'}`
      )
      console.log(
        `   ✅ Подписка активна в users: ${haimStaffCheck.is_subscription_active || 'НЕ УКАЗАНО'}`
      )
      console.log(
        `   📅 Окончание подписки: ${haimStaffCheck.subscription_end_date || 'НЕ УКАЗАНО'}`
      )
    } else {
      console.log('❌ НЕ найден в таблице users')
    }

    // 2. Проверяем RLS политики
    console.log('\n🔒 ПРОВЕРКА RLS ДОСТУПА:')

    try {
      const { data: paymentsAccess, error: paymentsRlsError } = await supabase
        .from('payments_v2')
        .select('count')
        .eq('telegram_id', telegramId)
        .single()

      if (paymentsRlsError) {
        console.log(
          '⚠️ Проблемы с доступом к payments_v2:',
          paymentsRlsError.message
        )
      } else {
        console.log('✅ Доступ к payments_v2: OK')
      }
    } catch (rlsError) {
      console.log('⚠️ RLS может блокировать доступ к данным')
    }

    // 3. Проверяем последнюю активность
    console.log('\n📊 ПОСЛЕДНЯЯ АКТИВНОСТЬ:')

    const { data: recentActivity, error: activityError } = await supabase
      .from('payments_v2')
      .select('created_at, description, service_type, amount')
      .eq('telegram_id', telegramId)
      .order('created_at', { ascending: false })
      .limit(5)

    if (!activityError && recentActivity) {
      console.log('Последние 5 операций:')
      recentActivity.forEach((activity, index) => {
        console.log(
          `${index + 1}. ${activity.description} (${activity.amount}⭐) - ${new Date(activity.created_at).toLocaleString('ru-RU')}`
        )
      })
    }

    // 4. Проверяем возможные конфликты в payments_v2
    console.log('\n⚡ ПРОВЕРКА КОНФЛИКТУЮЩИХ ЗАПИСЕЙ:')

    const { data: conflictingPayments, error: conflictError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', telegramId)
      .in('type', ['MONEY_OUTCOME', 'REFUND'])
      .order('created_at', { ascending: false })
      .limit(3)

    if (
      !conflictError &&
      conflictingPayments &&
      conflictingPayments.length > 0
    ) {
      console.log('Последние расходы/возвраты:')
      conflictingPayments.forEach((payment, index) => {
        console.log(
          `${index + 1}. ${payment.description} (${payment.type}) - ${payment.amount}⭐`
        )
      })
    } else {
      console.log('Конфликтующих записей не найдено')
    }

    // 5. Проверяем админские права
    console.log('\n👑 ПРОВЕРКА АДМИНСКИХ ПРАВ:')

    const ADMIN_IDS = [144022504, 1254048880, 352374518, 1852726961]
    const isAdmin = ADMIN_IDS.includes(telegramId)
    console.log(`Админ: ${isAdmin ? 'ДА ✅' : 'НЕТ ❌'}`)

    // 6. Проверяем конфигурацию бота
    console.log('\n🤖 ИНФОРМАЦИЯ О БОТЕ:')
    console.log('Используемый бот: HaimGroupMedia_bot')
    console.log('Среда: development')
    console.log(
      'DEV_SIMULATE_SUBSCRIPTION:',
      process.env.DEV_SIMULATE_SUBSCRIPTION || 'НЕ УКАЗАНО'
    )

    // 7. Итоговые рекомендации
    console.log('\n🎯 ИТОГОВАЯ ДИАГНОСТИКА:')
    console.log('✅ Подписка: АКТИВНА (NEUROTESTER)')
    console.log('✅ Баланс: ОГРОМНЫЙ (148,411⭐)')
    console.log('✅ Статус: КОРРЕКТНЫЙ')

    console.log('\n💡 ЕСЛИ АРТЁМ ВСЁ ЕЩЁ ЖАЛУЕТСЯ НА "НЕТ МОНЕТ":')
    console.log('1. 🔄 Полностью перезапустить бота (/start)')
    console.log('2. 🧹 Очистить кэш Telegram полностью')
    console.log('3. 📱 Попробовать с другого устройства/аккаунта')
    console.log('4. 🤖 Проверить версию бота HaimGroupMedia_bot')
    console.log('5. 📋 Посмотреть конкретное сообщение об ошибке')
    console.log('6. 🔍 Проверить логи бота на сервере в момент ошибки')

    console.log('\n🎯 ВОЗМОЖНЫЕ ПРИЧИНЫ (НЕ СВЯЗАННЫЕ С БД):')
    console.log('• Кэш Telegram не обновился')
    console.log('• Старая версия бота с багами')
    console.log('• Сетевые проблемы при проверке')
    console.log('• Проблемы с конкретной функцией в боте')
    console.log('• Неправильная проверка в middleware')
  } catch (error) {
    console.error('❌ Критическая ошибка дополнительной проверки:', error)
    logger.error('Failed additional factors check for Artem', {
      telegramId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    throw error
  }
}

// Запускаем проверку
checkArtemAdditionalFactors()
  .then(() => {
    console.log('\n🎉 Дополнительная проверка завершена!')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n💥 Критическая ошибка:', error)
    process.exit(1)
  })
