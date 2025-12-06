const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function manageTestUser() {
  const telegramId = '5732975798';

  try {
    console.log('🔍 Проверяем пользователя 5732975798...\n');

    // 1. Проверяем текущего пользователя
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .maybeSingle();

    if (userError) {
      console.log('⚠️ Пользователь не найден в системе, создаем запись...');
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          telegram_id: telegramId,
          username: 'test_user_5732975798',
          language: 'ru',
          is_test: true,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        console.error('❌ Ошибка при создании пользователя:', createError.message);
        throw createError;
      }
      console.log('✅ Пользователь создан:', newUser.id);
    } else {
      console.log('✅ Пользователь найден:', user.id);
    }

    // 2. Убеждаемся, что поле is_test существует и установлено
    console.log('\n📝 Проверяем поле is_test...');
    const { error: alterError } = await supabase.rpc('exec_sql', {
      query: `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT FALSE;`
    });

    if (!alterError) {
      console.log('✅ Колонка is_test готова');
    }

    // 3. Помечаем как тестового
    console.log('\n🏷️ Помечаем пользователя как тестового...');
    const { error: markError } = await supabase
      .from('users')
      .update({ is_test: true })
      .eq('telegram_id', telegramId);

    if (markError) {
      console.log('⚠️ Ошибка при пометке:', markError.message);
    } else {
      console.log('✅ Пользователь помечен как тестовый');
    }

    // 4. Добавляем подписку NEUROVIDEO
    console.log('\n🎬 Добавляем подписку NEUROVIDEO...');
    const timestamp = Math.floor(Date.now() / 1000);

    const { data: payment, error: paymentError } = await supabase
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
          created_by_admin: '5732975798',
          reason: 'Test user',
          original_subscription_type: 'NEUROVIDEO'
        }
      })
      .select()
      .single();

    if (paymentError) {
      console.error('❌ Ошибка при добавлении подписки:', paymentError.message);
      throw paymentError;
    } else {
      console.log('✅ Подписка NEUROVIDEO добавлена!');
      console.log('🆔 ID платежа:', payment.id);
    }

    // 5. Проверяем результат
    console.log('\n🔍 Проверяем результат...\n');

    const { data: verifyUser, error: verifyError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();

    if (verifyError) {
      console.log('⚠️ Ошибка при проверке пользователя:', verifyError.message);
    } else {
      console.log('=== ПОЛЬЗОВАТЕЛЬ 5732975798 ===');
      console.log('   ID в системе:', verifyUser.id);
      console.log('   Username:', verifyUser.username || 'не указан');
      console.log('   Является тестовым:', verifyUser.is_test ? '✅ ДА' : '❌ НЕТ');
    }

    const { data: verifyPayments, error: verifyPayError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', telegramId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (verifyPayError) {
      console.log('⚠️ Ошибка при проверке платежей:', verifyPayError.message);
    } else if (verifyPayments && verifyPayments.length > 0) {
      console.log('\n=== ПОДПИСКА ===');
      console.log('   Тип:', verifyPayments[0].subscription_type);
      console.log('   Статус:', verifyPayments[0].status);
      console.log('   Это тестовый платеж:', verifyPayments[0].is_test ? '✅ ДА' : '❌ НЕТ');
      console.log('   Создано:', new Date(verifyPayments[0].created_at).toLocaleString('ru-RU'));
    }

    console.log('\n🎉 ГОТОВО! Пользователь 5732975798:');
    console.log('   ✅ Помечен как тестовый (is_test = true)');
    console.log('   ✅ Имеет подписку NEUROVIDEO');

  } catch (err) {
    console.error('\n❌ ОШИБКА:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

manageTestUser().then(() => {
  console.log('\n✅ Скрипт завершен');
  process.exit(0);
});
