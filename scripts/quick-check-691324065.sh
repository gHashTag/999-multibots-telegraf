#!/bin/bash

# Quick User Check - Telegram ID: 691324065
# This script performs a comprehensive check and automatic fix if needed

TELEGRAM_ID="691324065"
SERVER="212.86.115.30"
SSH_KEY="~/.ssh/zomro"
PROJECT_PATH="/root/bot-farm"

echo "========================================="
echo "Quick User Check & Fix"
echo "Telegram ID: $TELEGRAM_ID"
echo "========================================="
echo ""

ssh -i ~/.ssh/zomro root@$SERVER << ENDSSH
cd $PROJECT_PATH

echo "🔍 Checking user $TELEGRAM_ID in production database..."
echo ""

node -e "
const { supabase } = require('./dist/core/supabase/client.js');
const { getUserBalance } = require('./dist/core/supabase/getUserBalance.js');
const { getUserDetailsSubscription } = require('./dist/core/supabase/getUserDetailsSubscription.js');

async function checkAndFixUser() {
  const TELEGRAM_ID = '$TELEGRAM_ID';
  const MIN_BALANCE = 10000;
  const BONUS_STARS = 50000;

  console.log('=' .repeat(80));
  console.log('📋 STEP 1: Checking user in database...');
  console.log('=' .repeat(80));

  // Check user existence
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', TELEGRAM_ID)
    .maybeSingle();

  if (userError && !userError.message.includes('Range')) {
    console.error('❌ Database error:', userError.message);
  }

  if (!userData) {
    console.log('⚠️  User NOT FOUND in users table');
    console.log('   Note: User may need to /start the bot first');
  } else {
    console.log('✅ User FOUND:');
    console.log('   - ID:', userData.id);
    console.log('   - Username:', userData.username || 'N/A');
    console.log('   - First Name:', userData.first_name || 'N/A');
    console.log('   - Bot:', userData.bot_name || 'N/A');
    console.log('   - Created:', userData.created_at);
  }

  console.log('');
  console.log('=' .repeat(80));
  console.log('💰 STEP 2: Checking balance...');
  console.log('=' .repeat(80));

  const balance = await getUserBalance(TELEGRAM_ID);
  console.log('✅ Current Balance:', balance, 'stars');

  console.log('');
  console.log('=' .repeat(80));
  console.log('📊 STEP 3: Checking subscription...');
  console.log('=' .repeat(80));

  const details = await getUserDetailsSubscription(TELEGRAM_ID);
  console.log('✅ User Details:');
  console.log('   - Exists:', details.isExist);
  console.log('   - Balance:', details.stars, 'stars');
  console.log('   - Subscription:', details.subscriptionType || 'NONE');
  console.log('   - Active:', details.isSubscriptionActive);
  console.log('   - Start Date:', details.subscriptionStartDate || 'N/A');

  console.log('');
  console.log('=' .repeat(80));
  console.log('🔍 STEP 4: Determining actions needed...');
  console.log('=' .repeat(80));

  const needsSubscription = !details.isSubscriptionActive;
  const needsBalance = balance < MIN_BALANCE;

  console.log('   - Needs subscription:', needsSubscription ? '❌ YES' : '✅ NO');
  console.log('   - Needs balance top-up:', needsBalance ? '❌ YES' : '✅ NO');

  let actionsPerformed = [];

  // Grant subscription if needed
  if (needsSubscription) {
    console.log('');
    console.log('⚡ ACTION: Granting NEUROTESTER subscription...');

    const { data: subResult, error: subError } = await supabase
      .from('payments_v2')
      .insert({
        telegram_id: TELEGRAM_ID,
        amount: 0,
        stars: 0,
        currency: 'RUB',
        status: 'COMPLETED',
        type: 'MONEY_INCOME',
        subscription_type: 'NEUROTESTER',
        payment_method: 'Manual Admin Grant',
        bot_name: 'neuro_blogger_bot',
        inv_id: \`manual-neurotester-\${Date.now()}\`,
        description: \`Admin grant NEUROTESTER for user \${TELEGRAM_ID}\`,
        payment_date: new Date().toISOString(),
        is_system_payment: true,
        category: 'BONUS'
      })
      .select();

    if (subError) {
      console.error('   ❌ Error:', subError.message);
    } else {
      console.log('   ✅ NEUROTESTER granted successfully!');
      console.log('   Transaction ID:', subResult[0]?.id);
      actionsPerformed.push('NEUROTESTER subscription');
    }
  }

  // Add stars if needed
  if (needsBalance) {
    console.log('');
    console.log(\`⚡ ACTION: Adding \${BONUS_STARS} stars...\`);

    const { data: starsResult, error: starsError } = await supabase
      .from('payments_v2')
      .insert({
        telegram_id: TELEGRAM_ID,
        amount: 0,
        stars: BONUS_STARS,
        currency: 'XTR',
        status: 'COMPLETED',
        type: 'STAR_INCOME',
        payment_method: 'Manual Admin Grant',
        bot_name: 'neuro_blogger_bot',
        inv_id: \`manual-stars-\${Date.now()}\`,
        description: \`Admin grant \${BONUS_STARS} stars for user \${TELEGRAM_ID}\`,
        payment_date: new Date().toISOString(),
        is_system_payment: true,
        category: 'BONUS'
      })
      .select();

    if (starsError) {
      console.error('   ❌ Error:', starsError.message);
    } else {
      console.log(\`   ✅ \${BONUS_STARS} stars added successfully!\`);
      console.log('   Transaction ID:', starsResult[0]?.id);
      actionsPerformed.push(\`\${BONUS_STARS} stars\`);
    }
  }

  // Verify changes
  if (actionsPerformed.length > 0) {
    console.log('');
    console.log('=' .repeat(80));
    console.log('🔎 STEP 5: Verifying changes...');
    console.log('=' .repeat(80));

    // Wait a bit for DB to update
    await new Promise(resolve => setTimeout(resolve, 2000));

    const newBalance = await getUserBalance(TELEGRAM_ID);
    const newDetails = await getUserDetailsSubscription(TELEGRAM_ID);

    console.log('✅ Updated Status:');
    console.log('   - Balance:', newBalance, 'stars');
    console.log('   - Subscription:', newDetails.subscriptionType || 'NONE');
    console.log('   - Active:', newDetails.isSubscriptionActive);
  }

  // Final report
  console.log('');
  console.log('=' .repeat(80));
  console.log('📊 FINAL REPORT');
  console.log('=' .repeat(80));
  console.log('🆔 Telegram ID:', TELEGRAM_ID);
  console.log('📱 User Exists:', details.isExist ? 'YES ✓' : 'NO ✗');
  console.log('💰 Final Balance:', balance, 'stars', needsBalance ? '(LOW)' : '(OK)');
  console.log('📋 Subscription:', details.subscriptionType || 'NONE');
  console.log('✅ Active:', details.isSubscriptionActive ? 'YES ✓' : 'NO ✗');
  console.log('');
  console.log('🎯 Actions Performed:', actionsPerformed.length > 0 ? actionsPerformed.join(' + ') : 'None needed');
  console.log('');
  console.log('🚀 Full Access:', (details.isSubscriptionActive || actionsPerformed.includes('NEUROTESTER subscription')) &&
    (balance >= MIN_BALANCE || actionsPerformed.includes(\`\${BONUS_STARS} stars\`)) ?
    '✅ YES' : '❌ NO');
  console.log('=' .repeat(80));
}

checkAndFixUser().then(() => process.exit(0)).catch(err => {
  console.error('❌ CRITICAL ERROR:', err.message);
  process.exit(1);
});
"

ENDSSH

echo ""
echo "Execution completed at $(date)"
