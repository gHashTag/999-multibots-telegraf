/**
 * Скрипт для добавления баланса пользователю
 * Баланс хранится в payments_v2, вычисляется динамически через get_user_balance RPC
 *
 * Использование:
 * bun run scripts/users/add-balance.ts <telegram_id> <amount>
 */
import { initInfisical, getSecret } from '../../src/core/infisical';
import { createClient } from '@supabase/supabase-js';

async function addBalance() {
  const telegramId = process.argv[2];
  const amount = parseFloat(process.argv[3]);

  if (!telegramId || isNaN(amount)) {
    console.error('❌ Использование: bun run scripts/users/add-balance.ts <telegram_id> <amount>');
    console.error('Пример: bun run scripts/users/add-balance.ts 5439920152 1000');
    process.exit(1);
  }

  console.log('🔐 Инициализация...');
  await initInfisical();

  const supabase = createClient(
    getSecret('SUPABASE_URL')!,
    getSecret('SUPABASE_SERVICE_KEY')!
  );

  // Получаем информацию о пользователе
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('username')
    .eq('telegram_id', telegramId)
    .single();

  if (userError) {
    console.error('❌ Пользователь не найден:', userError.message);
    process.exit(1);
  }

  // Получаем текущий баланс через RPC
  const { data: oldBalance, error: balanceError } = await supabase.rpc(
    'get_user_balance',
    { user_telegram_id: telegramId }
  );

  if (balanceError) {
    console.error('❌ Ошибка получения баланса:', balanceError.message);
    process.exit(1);
  }

  console.log(`\n👤 Пользователь: @${user?.username || 'unknown'} (${telegramId})`);
  console.log(`💰 Текущий баланс: ${oldBalance || 0} ⭐`);
  console.log(`➕ Добавляем: ${amount} ⭐`);

  // Создаём запись в payments_v2 для пополнения баланса
  // type должен быть uppercase для соответствия enum в БД
  const paymentRecord = {
    telegram_id: Number(telegramId),
    amount: amount,
    stars: amount,
    currency: 'XTR',
    status: 'COMPLETED',
    type: 'MONEY_INCOME', // UPPERCASE для соответствия enum operation_type в Supabase
    payment_method: 'admin',
    description: 'Пополнение баланса администратором',
    bot_name: 'neuro_blogger_bot',
    inv_id: `admin-${Date.now()}-${telegramId}`,
    payment_date: new Date().toISOString(),
    cost: 0,
    category: 'BONUS',
    metadata: {
      admin_action: true,
      old_balance: oldBalance || 0,
      added_at: new Date().toISOString()
    }
  };

  const { error: paymentError } = await supabase
    .from('payments_v2')
    .insert(paymentRecord);

  if (paymentError) {
    console.error('❌ Ошибка создания транзакции:', paymentError.message);
    console.error('Details:', paymentError);
    process.exit(1);
  }

  console.log('✅ Транзакция создана в payments_v2');

  // Проверяем новый баланс
  const { data: newBalance, error: newBalanceError } = await supabase.rpc(
    'get_user_balance',
    { user_telegram_id: telegramId }
  );

  if (newBalanceError) {
    console.warn('⚠️ Ошибка проверки нового баланса:', newBalanceError.message);
  } else {
    console.log(`\n📊 Новый баланс: ${newBalance} ⭐`);
  }

  console.log('\n✅ Баланс успешно обновлён!');
  process.exit(0);
}

addBalance().catch(e => {
  console.error('❌ Ошибка:', e);
  process.exit(1);
});
