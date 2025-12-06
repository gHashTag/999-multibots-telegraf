/**
 * Управление тестовым пользователем 5732975798
 * - Добавление подписки NEUROVIDEO
 * - Пометка как тестового (is_test = true)
 * - Использует существующую инфраструктуру проекта
 */

require('dotenv').config({ path: '.env' })

const { initInfisical } = require('./src/core/infisical/index')
const { supabaseAdmin } = require('./src/core/supabase/client')

async function manageTestUser() {
  const telegramId = '5732975798'

  try {
    // Инициализируем Infisical для загрузки секретов
    console.log('🔐 Загружаем секреты из Infisical...\n')
    await initInfisical()
    console.log('✅ Секреты загружены\n')

    console.log('🔍 Проверяем пользователя 5732975798...\n')

    // 1. Проверяем/создаем пользователя
    console.log('1️⃣ Проверяем пользователя в системе...')
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .maybeSingle()

    if (userError) {
      console.error('❌ Ошибка при поиске пользователя:', userError.message)
      throw userError
    }

    if (!user) {
      console.log('   Пользователь не найден, создаем...')
      const { data: newUser, error: createError } = await supabaseAdmin
        .from('users')
        .insert({
          telegram_id: telegramId,
          username: 'test_user_5732975798',
          language: 'ru',
          is_test: true,
          created_at: new Date().toISOString()
        })
        .select()
        .single()

      if (createError) {
        console.error('❌ Ошибка при создании пользователя:', createError.message)
        throw createError
      }
      console.log('   ✅ Пользователь создан:', newUser.id)
    } else {
      console.log('   ✅ Пользователь найден:', user.id)
    }

    // 2. Убеждаемся, что поле is_test существует
    console.log('\n2️⃣ Проверяем поле is_test в таблице users...')
    try {
      await supabaseAdmin.rpc('exec_sql', {
        query: `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT FALSE;`
      })
      console.log('   ✅ Колонка is_test готова')
    } catch (e) {
      console.log('   ⚠️ Не удалось добавить колонку (возможно, уже существует):', e.message)
    }

    // 3. Помечаем пользователя как тестового
    console.log('\n3️⃣ Помечаем пользователя как тестового...')
    const { error: markError } = await supabaseAdmin
      .from('users')
      .update({ is_test: true })
      .eq('telegram_id', telegramId)

    if (markError) {
      console.error('❌ Ошибка при пометке:', markError.message)
      throw markError
    }
    console.log('   ✅ Пользователь помечен как тестовый (is_test = true)')

    // 4. Добавляем подписку NEUROVIDEO
    console.log('\n4️⃣ Добавляем подписку NEUROVIDEO...')
    const timestamp = Date.now()
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('payments_v2')
      .insert({
        telegram_id: telegramId,
        amount: 0,
        type: 'MONEY_INCOME',
        category: 'BONUS',
        description: 'Manual subscription override: NEUROVIDEO (test user)',
        bot_name: 'admin_tools',
        service_type: 'subscription',
        model_name: 'manual_override',
        payment_method: 'ADMIN_OVERRIDE',
        inv_id: `admin_override_${telegramId}_${timestamp}`,
        stars: 0,
        status: 'COMPLETED',
        currency: 'RUB',
        subscription_type: 'NEUROVIDEO',
        is_test: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          manual_override: true,
          created_by_admin: telegramId,
          reason: 'Test user',
          original_subscription_type: 'NEUROVIDEO'
        }
      })
      .select()
      .single()

    if (paymentError) {
      console.error('❌ Ошибка при добавлении подписки:', paymentError.message)
      throw paymentError
    } else {
      console.log('   ✅ Подписка NEUROVIDEO добавлена!')
      console.log('   🆔 ID платежа:', payment.id)
    }

    // 5. Проверяем результат
    console.log('\n5️⃣ Проверяем результат...')
    const { data: verifyUser, error: verifyError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single()

    if (verifyError) {
      console.error('❌ Ошибка при проверке пользователя:', verifyError.message)
    } else {
      console.log('\n=== ПОЛЬЗОВАТЕЛЬ 5732975798 ===')
      console.log('   ID в системе:', verifyUser.id)
      console.log('   Username:', verifyUser.username || 'не указан')
      console.log('   Является тестовым:', verifyUser.is_test ? '✅ ДА' : '❌ НЕТ')
      console.log('   Создан:', new Date(verifyUser.created_at).toLocaleString('ru-RU'))
    }

    const { data: verifyPayments, error: verifyPayError } = await supabaseAdmin
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', telegramId)
      .order('created_at', { ascending: false })
      .limit(1)

    if (verifyPayError) {
      console.error('❌ Ошибка при проверке платежей:', verifyPayError.message)
    } else if (verifyPayments && verifyPayments.length > 0) {
      console.log('\n=== ПОДПИСКА ===')
      console.log('   Тип:', verifyPayments[0].subscription_type)
      console.log('   Статус:', verifyPayments[0].status)
      console.log('   Это тестовый платеж:', verifyPayments[0].is_test ? '✅ ДА' : '❌ НЕТ')
      console.log('   Создано:', new Date(verifyPayments[0].created_at).toLocaleString('ru-RU'))
    }

    console.log('\n🎉 ГОТОВО! Задача выполнена:')
    console.log('   ✅ Пользователь 5732975798 помечен как тестовый (is_test = true)')
    console.log('   ✅ Пользователь имеет подписку NEUROVIDEO')
    console.log('   ✅ Подписка помечена как тестовая (is_test = true)')

    return true

  } catch (err) {
    console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА:', err.message)
    console.error(err.stack)
    process.exit(1)
  }
}

// Запуск
manageTestUser()
  .then(() => {
    console.log('\n✅ Скрипт завершен успешно')
    process.exit(0)
  })
  .catch((err) => {
    console.error('\n❌ Скрипт завершен с ошибкой:', err.message)
    process.exit(1)
  })
