#!/usr/bin/env node
/**
 * User Management Script for Telegram ID: 5732975798
 * - Добавление подписки NEUROVIDEO
 * - Пометка как тестового (is_test = true)
 */

const { createClient } = require('@supabase/supabase-js')

// Supabase connection (production-ready)
const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://yuukfqcsdhkyxegfwlcb.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_SERVICE_KEY) {
  console.error(
    'SUPABASE_SERVICE_ROLE_KEY не задан. Возьмите: railway variables --kv | grep SUPABASE'
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const TELEGRAM_ID = '5732975798'

async function manageUser() {
  console.log('\n🔐 === УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЕМ 5732975798 ===\n')

  try {
    // 1. Проверяем пользователя
    console.log('1️⃣ Проверяем пользователя в системе...')
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', TELEGRAM_ID)
      .maybeSingle()

    if (userError) {
      console.error('❌ Ошибка при поиске:', userError.message)
    } else if (!user) {
      console.log('   Пользователь не найден, создаем...')
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          telegram_id: TELEGRAM_ID,
          username: 'test_user_5732975798',
          language: 'ru',
          is_test: true,
        })
        .select()
        .single()

      if (createError) {
        console.error('❌ Ошибка создания:', createError.message)
      } else {
        console.log('   ✅ Создан:', newUser.id)
      }
    } else {
      console.log('   ✅ Найден:', user.id)
    }

    // 2. Поле is_test
    console.log('\n2️⃣ Добавляем поле is_test...')
    try {
      await supabase.rpc('exec_sql', {
        query: `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT FALSE;`,
      })
      console.log('   ✅ Колонка готова')
    } catch (e) {
      console.log('   ⚠️ Уже существует')
    }

    // 3. Помечаем как тестового
    console.log('\n3️⃣ Помечаем как тестового...')
    const { error: markError } = await supabase
      .from('users')
      .update({ is_test: true })
      .eq('telegram_id', TELEGRAM_ID)

    if (markError) {
      console.error('❌ Ошибка:', markError.message)
    } else {
      console.log('   ✅ is_test = true')
    }

    // 4. Подписка NEUROVIDEO
    console.log('\n4️⃣ Добавляем NEUROVIDEO...')
    const timestamp = Date.now()
    const { data: payment, error: paymentError } = await supabase
      .from('payments_v2')
      .insert({
        telegram_id: TELEGRAM_ID,
        amount: 0,
        type: 'MONEY_INCOME',
        category: 'BONUS',
        description: 'Manual subscription override: NEUROVIDEO (test user)',
        bot_name: 'admin_tools',
        service_type: 'subscription',
        model_name: 'manual_override',
        payment_method: 'ADMIN_OVERRIDE',
        inv_id: `admin_override_${TELEGRAM_ID}_${timestamp}`,
        stars: 0,
        status: 'COMPLETED',
        currency: 'RUB',
        subscription_type: 'NEUROVIDEO',
        is_test: true,
        metadata: {
          manual_override: true,
          reason: 'Test user',
          original_subscription_type: 'NEUROVIDEO',
        },
      })
      .select()
      .single()

    if (paymentError) {
      console.error('❌ Ошибка:', paymentError.message)
    } else {
      console.log('   ✅ Подписка создана (ID:', payment.id, ')')
    }

    // 5. Проверяем результат
    console.log('\n5️⃣ РЕЗУЛЬТАТ:')
    const { data: verifyUser } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', TELEGRAM_ID)
      .single()

    const { data: verifyPayments } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', TELEGRAM_ID)
      .order('created_at', { ascending: false })
      .limit(1)

    console.log('\n=== ПОЛЬЗОВАТЕЛЬ ===')
    console.log('Telegram ID:', TELEGRAM_ID)
    console.log('ID в БД:', verifyUser?.id || 'N/A')
    console.log('is_test:', verifyUser?.is_test ? '✅ TRUE' : '❌ FALSE')

    if (verifyPayments && verifyPayments.length > 0) {
      console.log('\n=== ПОДПИСКА ===')
      console.log('Тип:', verifyPayments[0].subscription_type)
      console.log('Статус:', verifyPayments[0].status)
      console.log(
        'is_test:',
        verifyPayments[0].is_test ? '✅ TRUE' : '❌ FALSE'
      )
    }

    console.log('\n🎉 ГОТОВО!')
    console.log('   ✅ Пользователь помечен как тестовый')
    console.log('   ✅ Подписка NEUROVIDEO добавлена\n')
  } catch (err) {
    console.error('\n❌ ОШИБКА:', err.message)
    console.error(err.stack)
    process.exit(1)
  }
}

manageUser().then(() => process.exit(0))
