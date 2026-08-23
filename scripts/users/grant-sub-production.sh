#!/bin/bash

# Grant NEUROVIDEO subscription to user 7912847443
# Production server: root@212.86.115.30

# service_role ключ берётся только из окружения. Пустая строка вместо ключа
# даёт невнятную ошибку от Supabase, поэтому падаем сразу и громко.
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "SUPABASE_SERVICE_ROLE_KEY не задан. Возьмите: railway variables --kv | grep SUPABASE" >&2
  exit 1
fi

echo "=========================================="
echo "GRANTING SUBSCRIPTION ON PRODUCTION"
echo "User ID: 7912847443"
echo "Type: NEUROVIDEO (standard, NOT ero-video)"
echo "Server: root@212.86.115.30"
echo "=========================================="

# SSH to production and execute the grant
ssh -i ~/.ssh/selectel root@212.86.115.30 "cd /root/999-agents-telegraf && docker exec 999-multibots node -e \"
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://yuukfqcsdhkyxegfwlcb.supabase.co',
  '$SUPABASE_SERVICE_ROLE_KEY'
);

const TELEGRAM_ID = '7912847443';

(async () => {
  try {
    console.log('Checking user status...');
    const { data: userData } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', TELEGRAM_ID)
      .single();

    if (userData) {
      console.log('User found:', userData.username || userData.first_name || 'N/A');
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    console.log('Granting NEUROVIDEO subscription...');

    const { data, error } = await supabase
      .from('payments_v2')
      .insert({
        telegram_id: TELEGRAM_ID,
        subscription_type: 'NEUROVIDEO',
        status: 'COMPLETED',
        type: 'MONEY_INCOME',
        category: 'BONUS',
        is_system_payment: true,
        payment_method: 'Manual',
        bot_name: 'neuro_blogger_bot',
        description: 'Admin grant - standard subscription (NOT ero-video)',
        subscription_expires_at: expiresAt.toISOString(),
        stars: 0,
        currency: 'RUB',
        amount: 0,
        inv_id: 'manual_grant_' + Date.now() + '_' + TELEGRAM_ID
      })
      .select();

    if (error) throw error;

    console.log('SUCCESS! Subscription granted');
    console.log('Type: NEUROVIDEO');
    console.log('Expires:', expiresAt.toISOString());
    console.log('User can now use the bot!');
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
\""

echo ""
echo "=========================================="
echo "Execution completed!"
echo "=========================================="
