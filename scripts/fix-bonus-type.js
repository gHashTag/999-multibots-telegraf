/**
 * Script to fix bonus type from BONUS to MONEY_INCOME
 * Run: node scripts/fix-bonus-type.js
 */

const { createClient } = require('@supabase/supabase-js');

// Load secrets from Infisical first, then run this script
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  console.error('Run: source .env && infisical run --env=prod -- node scripts/fix-bonus-type.js');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function fixBonusType() {
  console.log('Updating bonus type to MONEY_INCOME...');

  const { data, error } = await supabase
    .from('payments_v2')
    .update({ type: 'MONEY_INCOME' })
    .in('telegram_id', [693774948, 691324065])
    .eq('description', 'Бонус от администратора для баланса 1000⭐')
    .select();

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log('Updated records:', data);

  // Verify new balance
  console.log('\nVerifying balances...');

  for (const telegramId of [693774948, 691324065]) {
    const { data: balance, error: balError } = await supabase.rpc('get_user_balance', {
      user_telegram_id: telegramId.toString()
    });

    if (balError) {
      console.error(`Error getting balance for ${telegramId}:`, balError);
    } else {
      console.log(`Balance for ${telegramId}: ${balance} ⭐`);
    }
  }
}

fixBonusType();
