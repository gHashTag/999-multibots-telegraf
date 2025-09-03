/**
 * Скрипт для административного продления подписки пользователю
 * Использование: npx tsx scripts/extend-user-subscription.ts
 */

import { config } from 'dotenv'
import { adminRenewSubscription } from '../src/core/supabase/adminRenewSubscription'
import { checkSubscriptionByTelegramId } from '../src/core/supabase/checkSubscriptionByTelegramId'
import { getUserByTelegramId } from '../src/core/supabase/getUserByTelegramId'
import { SubscriptionType } from '../src/interfaces/subscription.interface'
import { supabase } from '../src/core/supabase/client'

// Загружаем переменные окружения
config()

async function extendUserSubscription() {
  const targetUserId = '7007992081'
  const subscriptionType = SubscriptionType.NEUROPHOTO
  const durationDays = 30
  
  console.log('🚀 Начинаем процесс продления подписки...')
  console.log('═══════════════════════════════════════')
  console.log('📋 Параметры:')
  console.log(`   • Telegram ID: ${targetUserId}`)
  console.log(`   • Тип подписки: ${subscriptionType}`)
  console.log(`   • Период: ${durationDays} дней`)
  console.log('═══════════════════════════════════════\n')
  
  try {
    // Шаг 1: Проверяем существование пользователя
    console.log('🔍 Шаг 1: Проверяем пользователя...')
    const user = await getUserByTelegramId(targetUserId)
    
    if (!user) {
      console.error('❌ ОШИБКА: Пользователь не найден в базе данных!')
      console.log('   Проверьте правильность Telegram ID')
      process.exit(1)
    }
    
    console.log('✅ Пользователь найден:')
    console.log(`   • ID в базе: ${user.id}`)
    console.log(`   • Username: @${user.username || 'не указан'}`)
    console.log(`   • Имя: ${user.first_name || 'не указано'} ${user.last_name || ''}`)
    console.log(`   • Дата регистрации: ${user.created_at || 'не указана'}\n`)
    
    // Шаг 2: Проверяем текущую подписку
    console.log('📊 Шаг 2: Проверяем текущий статус подписки...')
    const currentSubscription = await checkSubscriptionByTelegramId(targetUserId)
    console.log(`   Текущий статус: ${currentSubscription === 'unsubscribed' ? '❌ Нет активной подписки' : `✅ ${currentSubscription}`}\n`)
    
    // Шаг 3: Проверяем историю платежей
    console.log('💳 Шаг 3: Проверяем историю платежей...')
    const { data: payments, error: paymentsError } = await supabase
      .from('payments_v2')
      .select('id, created_at, subscription_type, amount, stars, type')
      .eq('telegram_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(5)
    
    if (paymentsError) {
      console.warn('⚠️  Не удалось получить историю платежей:', paymentsError.message)
    } else if (payments && payments.length > 0) {
      console.log(`   Найдено ${payments.length} последних платежей:`)
      payments.forEach((payment, index) => {
        const date = new Date(payment.created_at).toLocaleDateString('ru-RU')
        console.log(`   ${index + 1}. ${date} - ${payment.subscription_type || 'N/A'} (${payment.stars || payment.amount} ⭐)`)
      })
    } else {
      console.log('   История платежей пуста')
    }
    console.log('')
    
    // Шаг 4: Выполняем продление подписки
    console.log('⏳ Шаг 4: Выполняем продление подписки...')
    const result = await adminRenewSubscription({
      telegram_id: targetUserId,
      subscription_type: subscriptionType,
      duration_days: durationDays,
      bot_name: 'admin_cli',
      reason: 'Административное продление для доиспользования ботов'
    })
    
    if (result.success) {
      console.log('✅ УСПЕХ: Подписка успешно продлена!\n')
      
      // Шаг 5: Проверяем новый статус
      console.log('🔄 Шаг 5: Проверяем обновленный статус...')
      const newSubscription = await checkSubscriptionByTelegramId(targetUserId)
      console.log(`   Новый статус: ${newSubscription === 'unsubscribed' ? '❌ Ошибка активации' : `✅ ${newSubscription}`}`)
      
      // Проверяем запись в payments_v2
      const { data: newPayment, error: newPaymentError } = await supabase
        .from('payments_v2')
        .select('*')
        .eq('telegram_id', targetUserId)
        .eq('subscription_type', subscriptionType)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      
      if (!newPaymentError && newPayment) {
        console.log('\n📝 Детали созданной записи о продлении:')
        console.log(`   • ID записи: ${newPayment.id}`)
        console.log(`   • Дата создания: ${new Date(newPayment.created_at).toLocaleString('ru-RU')}`)
        console.log(`   • Тип операции: ${newPayment.type}`)
        console.log(`   • Сумма: ${newPayment.amount || 0} ⭐`)
        console.log(`   • Статус: ${newPayment.status}`)
      }
      
      console.log('\n═══════════════════════════════════════')
      console.log('🎉 ПРОДЛЕНИЕ ЗАВЕРШЕНО УСПЕШНО!')
      console.log('═══════════════════════════════════════')
      console.log('\n📱 Что дальше:')
      console.log('1. Пользователь может продолжить использование бота')
      console.log('2. Для уведомления пользователя администратор может использовать команду:')
      console.log('   /extend_7007992081')
      console.log('\n✨ Подписка активна до:', new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toLocaleDateString('ru-RU'))
      
    } else {
      console.error('❌ ОШИБКА: Не удалось продлить подписку')
      console.error(`   Причина: ${result.error || 'Неизвестная ошибка'}`)
      process.exit(1)
    }
    
  } catch (error) {
    console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА:')
    console.error(error instanceof Error ? error.message : String(error))
    if (error instanceof Error && error.stack) {
      console.error('\nСтек вызовов:')
      console.error(error.stack)
    }
    process.exit(1)
  }
}

// Запускаем скрипт
extendUserSubscription()
  .then(() => {
    console.log('\n✅ Скрипт завершен успешно')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n❌ Неожиданная ошибка:', error)
    process.exit(1)
  })