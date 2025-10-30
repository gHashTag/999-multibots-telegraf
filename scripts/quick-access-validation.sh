#!/bin/bash
# 🧪 QUICK ACCESS VALIDATION COMMANDS
# For immediate verification of user 8190001592 unlimited access grant

USER_ID="8190001592"
SSH_CMD="ssh -i ~/.ssh/selectel root@185.161.67.53 'cd /root/999-agents-telegraf"

echo "🧪 QUICK ACCESS VALIDATION FOR USER: $USER_ID"
echo "=============================================="

# 1. PRE-GRANT STATUS CHECK
echo "📊 1️⃣ PRE-GRANT STATUS CHECK"
echo "----------------------------"
$SSH_CMD && node -e \"
const { getUserDetailsSubscription } = require('./dist/core/supabase/getUserDetailsSubscription.js');
const { getUserBalance } = require('./dist/core/supabase/getUserBalance.js');

async function preCheck() {
  console.log('🔍 BEFORE GRANT STATUS:');
  const details = await getUserDetailsSubscription('$USER_ID');
  const balance = await getUserBalance('$USER_ID');
  console.log('   Type:', details.subscriptionType || 'NONE');
  console.log('   Active:', details.isSubscriptionActive);
  console.log('   Balance:', balance, 'stars');
  console.log('   Access:', details.subscriptionType === 'NEUROTESTER' ? '✅ UNLIMITED' : '❌ LIMITED');
}

preCheck().then(() => process.exit(0));
\"'"

echo ""
echo "🚀 2️⃣ GRANT EXECUTION COMMAND"
echo "-----------------------------"
echo "# Execute this command to grant unlimited access:"
echo "$SSH_CMD && node -e \\"
const { supabase } = require('./dist/core/supabase/index.js');

async function grantUnlimitedAccess() {
  const result = await supabase.from('payments_v2').insert({
    telegram_id: '$USER_ID',
    amount: 0,
    stars: 0,
    currency: 'RUB',
    status: 'COMPLETED',
    type: 'MONEY_INCOME',
    subscription_type: 'NEUROTESTER',
    payment_method: 'Admin_Grant',
    bot_name: 'hive_admin_grant',
    inv_id: 'hive-unlimited-' + Date.now(),
    description: 'Unlimited access granted by Hive Mind Swarm',
    payment_date: new Date().toISOString()
  });
  console.log('✅ Unlimited access granted:', result.data);
}

grantUnlimitedAccess().then(() => process.exit(0));
\\"\'"

echo ""
echo "✅ 3️⃣ POST-GRANT VERIFICATION"
echo "-----------------------------"
$SSH_CMD && node -e \"
const { getUserDetailsSubscription } = require('./dist/core/supabase/getUserDetailsSubscription.js');
const { getUserBalance } = require('./dist/core/supabase/getUserBalance.js');

async function postCheck() {
  console.log('🔍 AFTER GRANT VERIFICATION:');
  const details = await getUserDetailsSubscription('$USER_ID');
  const balance = await getUserBalance('$USER_ID');

  console.log('   📋 Subscription Type:', details.subscriptionType);
  console.log('   🔄 Is Active:', details.isSubscriptionActive);
  console.log('   📅 Start Date:', details.subscriptionStartDate);
  console.log('   ⏰ Expiry Date:', details.subscriptionExpiryDate);
  console.log('   💰 Balance:', balance, 'stars');

  const isUnlimited = details.subscriptionType === 'NEUROTESTER' && details.isSubscriptionActive;
  console.log('   🎯 Access Level:', isUnlimited ? '✅ UNLIMITED SUCCESS' : '❌ LIMITED - GRANT FAILED');

  if (isUnlimited) {
    console.log('');
    console.log('🎉 GRANT VERIFICATION SUCCESSFUL!');
    console.log('   User now has unlimited access to all features');
  } else {
    console.log('');
    console.log('❌ GRANT VERIFICATION FAILED!');
    console.log('   User still has limited access - check logs');
  }
}

postCheck().then(() => process.exit(0));
\"'"

echo ""
echo "🔄 4️⃣ CONTINUOUS MONITORING"
echo "---------------------------"
echo "# Use this command for ongoing monitoring:"
echo "$SSH_CMD && node -e \\"
const { getUserDetailsSubscription } = require('./dist/core/supabase/getUserDetailsSubscription.js');
async function monitor() {
  const details = await getUserDetailsSubscription('$USER_ID');
  console.log(new Date().toISOString(), '- User $USER_ID Status:');
  console.log('  Type:', details.subscriptionType, '| Active:', details.isSubscriptionActive);
}
monitor().then(() => process.exit(0));
\\"\'"

echo ""
echo "⚠️  5️⃣ ROLLBACK COMMAND (if needed)"
echo "-----------------------------------"
echo "# Use ONLY if rollback is required:"
echo "$SSH_CMD && node -e \\"
const { supabase } = require('./dist/core/supabase/index.js');

async function rollback() {
  const latest = await supabase
    .from('payments_v2')
    .select('*')
    .eq('telegram_id', '$USER_ID')
    .eq('subscription_type', 'NEUROTESTER')
    .eq('status', 'COMPLETED')
    .order('payment_date', { ascending: false })
    .limit(1);

  if (latest.data && latest.data.length > 0) {
    const result = await supabase
      .from('payments_v2')
      .update({ status: 'CANCELLED', description: 'ROLLED BACK BY HIVE ADMIN' })
      .eq('id', latest.data[0].id);
    console.log('🔄 Access rolled back:', result);
  } else {
    console.log('❌ No grant found to rollback');
  }
}

// UNCOMMENT TO EXECUTE:
// rollback().then(() => process.exit(0));
console.log('⚠️ Rollback prepared but not executed');
\\"\'"

echo ""
echo "🎯 VALIDATION COMPLETE"
echo "======================"
echo "Use the commands above in sequence:"
echo "1. Run pre-grant check to see current status"
echo "2. Execute grant command to provide unlimited access"
echo "3. Run post-grant verification to confirm success"
echo "4. Use monitoring for ongoing checks"
echo "5. Use rollback only if needed"