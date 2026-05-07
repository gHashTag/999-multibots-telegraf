#!/usr/bin/env node
/**
 * User Management Script for Telegram ID: 5781166218
 *
 * Tasks:
 * 1. Check user existence in database (users table)
 * 2. Check current balance (getUserBalance)
 * 3. Check subscription status (getUserDetailsSubscription)
 * 4. Grant NEUROVIDEO subscription if not active
 * 5. Verify user has access to neurovideo features after granting subscription
 */

const { createClient } = require('@supabase/supabase-js');

// Supabase credentials from .env
const SUPABASE_URL = 'https://yuukfqcsdhkyxegfwlcb.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1dWtmcWNzZGhreXhlZ2Z3bGNiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNTcyNDg0MywiZXhwIjoyMDUxMzAwODQzfQ.ilyzrMPwTYrjZfn3FZBJBM1GYTk-gQTKY9Qr86-KP_o';

const TELEGRAM_ID = '5781166218';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Utility function to format date
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Task 1: Check user existence in users table
async function checkUserExistence(telegramId) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 TASK 1: Checking user existence in users table');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .maybeSingle();

    if (error) {
      console.error('❌ Error checking user existence:', error.message);
      return { exists: false, data: null, error };
    }

    if (data) {
      console.log('✅ User FOUND in users table:');
      console.log('   - ID:', data.id);
      console.log('   - Telegram ID:', data.telegram_id);
      console.log('   - Username:', data.username || 'N/A');
      console.log('   - First Name:', data.first_name || 'N/A');
      console.log('   - Last Name:', data.last_name || 'N/A');
      console.log('   - Bot Name:', data.bot_name || 'N/A');
      console.log('   - Created At:', formatDate(data.created_at));
      console.log('   - Subscription in users:', data.subscription || 'N/A');
      return { exists: true, data };
    } else {
      console.log('❌ User NOT FOUND in users table');
      return { exists: false, data: null };
    }
  } catch (err) {
    console.error('❌ Exception in checkUserExistence:', err);
    return { exists: false, data: null, error: err };
  }
}

// Task 2: Check current balance using get_user_balance RPC
async function checkUserBalance(telegramId) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💰 TASK 2: Checking user balance (getUserBalance)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const { data: balance, error } = await supabase.rpc('get_user_balance', {
      user_telegram_id: telegramId.toString()
    });

    if (error) {
      console.error('❌ Error getting balance:', error.message);
      return { balance: 0, error };
    }

    const stars = balance || 0;
    console.log(`✅ Balance retrieved: ${stars.toLocaleString('ru-RU')} ⭐ stars`);

    // Get payment history for context
    const { data: payments, error: paymentsError } = await supabase
      .from('payments_v2')
      .select('type, stars, amount, currency, payment_date, description, status')
      .eq('telegram_id', telegramId)
      .order('payment_date', { ascending: false })
      .limit(5);

    if (!paymentsError && payments && payments.length > 0) {
      console.log('\n📊 Recent transactions (last 5):');
      payments.forEach((p, idx) => {
        console.log(`   ${idx + 1}. ${formatDate(p.payment_date)} | ${p.type} | ${p.stars || 0}⭐ | ${p.status} | ${p.description || 'N/A'}`);
      });
    }

    return { balance: stars };
  } catch (err) {
    console.error('❌ Exception in checkUserBalance:', err);
    return { balance: 0, error: err };
  }
}

// Task 3: Check subscription status (getUserDetailsSubscription logic)
async function checkSubscriptionStatus(telegramId) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 TASK 3: Checking subscription status');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const subscriptionPriority = ['NEUROTESTER', 'NEUROVIDEO', 'NEUROPHOTO'];
    const SUBSCRIPTION_DURATION_DAYS = 30;

    let activeSubscription = null;

    for (const subscriptionType of subscriptionPriority) {
      const { data: subData, error: subError } = await supabase
        .from('payments_v2')
        .select('subscription_type, payment_date, status, type, description')
        .eq('telegram_id', telegramId)
        .eq('status', 'COMPLETED')
        .eq('subscription_type', subscriptionType)
        .order('payment_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subError || !subData) continue;

      console.log(`🔍 Checking ${subscriptionType}:`, {
        date: formatDate(subData.payment_date),
        status: subData.status
      });

      // Check if active
      let isActive = false;
      let expirationDate = null;

      if (subscriptionType === 'NEUROTESTER') {
        isActive = true; // NEUROTESTER never expires
        console.log(`   ✅ NEUROTESTER subscription is PERMANENT (always active)`);
      } else {
        const paymentDate = new Date(subData.payment_date);
        const now = new Date();
        expirationDate = new Date(paymentDate);
        expirationDate.setDate(paymentDate.getDate() + SUBSCRIPTION_DURATION_DAYS);
        isActive = now < expirationDate;

        if (isActive) {
          console.log(`   ✅ ${subscriptionType} subscription is ACTIVE (expires ${formatDate(expirationDate)})`);
        } else {
          console.log(`   ❌ ${subscriptionType} subscription EXPIRED (expired ${formatDate(expirationDate)})`);
        }
      }

      if (isActive) {
        activeSubscription = {
          type: subscriptionType,
          startDate: subData.payment_date,
          expirationDate: expirationDate ? expirationDate.toISOString() : null,
          isActive: true
        };
        break;
      }
    }

    if (activeSubscription) {
      console.log('\n✅ ACTIVE SUBSCRIPTION FOUND:');
      console.log('   - Type:', activeSubscription.type);
      console.log('   - Start Date:', formatDate(activeSubscription.startDate));
      console.log('   - Expiration:', activeSubscription.expirationDate ? formatDate(activeSubscription.expirationDate) : 'Never (NEUROTESTER)');
      return { hasActiveSubscription: true, subscription: activeSubscription };
    } else {
      console.log('\n❌ NO ACTIVE SUBSCRIPTION FOUND');

      // Check for any past subscriptions
      const { data: allSubs } = await supabase
        .from('payments_v2')
        .select('subscription_type, payment_date, status')
        .eq('telegram_id', telegramId)
        .not('subscription_type', 'is', null)
        .order('payment_date', { ascending: false })
        .limit(5);

      if (allSubs && allSubs.length > 0) {
        console.log('\n📊 Past subscription history:');
        allSubs.forEach((s, idx) => {
          console.log(`   ${idx + 1}. ${s.subscription_type} | ${formatDate(s.payment_date)} | ${s.status}`);
        });
      }

      return { hasActiveSubscription: false, subscription: null };
    }
  } catch (err) {
    console.error('❌ Exception in checkSubscriptionStatus:', err);
    return { hasActiveSubscription: false, error: err };
  }
}

// Task 4: Grant NEUROVIDEO subscription
async function grantNeurovideoSubscription(telegramId, botName = 'neuro_blogger_bot') {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎁 TASK 4: Granting NEUROVIDEO subscription');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const invId = `manual-neurovideo-${Date.now()}`;
    const now = new Date().toISOString();

    const subscriptionData = {
      telegram_id: telegramId,
      amount: 0,
      stars: 0,
      currency: 'RUB',
      status: 'COMPLETED',
      type: 'MONEY_INCOME',
      category: 'BONUS',
      subscription_type: 'NEUROVIDEO',
      payment_method: 'Manual',
      bot_name: botName,
      inv_id: invId,
      is_system_payment: true,
      description: 'Manual NEUROVIDEO subscription grant by admin for user 5781166218',
      payment_date: now,
      created_at: now
    };

    console.log('📦 Inserting subscription payment record:');
    console.log('   - Subscription Type: NEUROVIDEO');
    console.log('   - Status: COMPLETED');
    console.log('   - Category: BONUS (admin grant)');
    console.log('   - Invoice ID:', invId);
    console.log('   - Payment Date:', formatDate(now));

    const { data, error } = await supabase
      .from('payments_v2')
      .insert([subscriptionData])
      .select();

    if (error) {
      console.error('❌ Error granting NEUROVIDEO subscription:', error.message);
      return { success: false, error };
    }

    console.log('\n✅ NEUROVIDEO subscription granted successfully!');
    console.log('   - Record ID:', data[0]?.id || 'N/A');
    console.log('   - Valid for: 30 days from', formatDate(now));

    const expirationDate = new Date(now);
    expirationDate.setDate(expirationDate.getDate() + 30);
    console.log('   - Expires on:', formatDate(expirationDate));

    return { success: true, data: data[0], invId };
  } catch (err) {
    console.error('❌ Exception in grantNeurovideoSubscription:', err);
    return { success: false, error: err };
  }
}

// Task 5: Verify user has access to neurovideo features
async function verifyNeurovideoAccess(telegramId) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 TASK 5: Verifying NEUROVIDEO access');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Re-check subscription status
    const subscriptionCheck = await checkSubscriptionStatus(telegramId);

    if (subscriptionCheck.hasActiveSubscription) {
      const sub = subscriptionCheck.subscription;

      if (sub.type === 'NEUROVIDEO' || sub.type === 'NEUROTESTER') {
        console.log('\n✅ VERIFICATION SUCCESSFUL:');
        console.log('   - User has active subscription:', sub.type);
        console.log('   - NEUROVIDEO features: ACCESSIBLE');

        if (sub.type === 'NEUROTESTER') {
          console.log('   - Note: NEUROTESTER includes all features (NEUROVIDEO + NEUROPHOTO)');
        }

        return {
          hasAccess: true,
          subscriptionType: sub.type,
          message: 'User has full access to NEUROVIDEO features'
        };
      } else {
        console.log('\n⚠️ VERIFICATION WARNING:');
        console.log('   - User has subscription:', sub.type);
        console.log('   - NEUROVIDEO features: LIMITED/NOT ACCESSIBLE');
        console.log('   - Active subscription does not include NEUROVIDEO');

        return {
          hasAccess: false,
          subscriptionType: sub.type,
          message: 'User subscription does not include NEUROVIDEO features'
        };
      }
    } else {
      console.log('\n❌ VERIFICATION FAILED:');
      console.log('   - No active subscription found');
      console.log('   - NEUROVIDEO features: NOT ACCESSIBLE');

      return {
        hasAccess: false,
        subscriptionType: null,
        message: 'No active subscription found'
      };
    }
  } catch (err) {
    console.error('❌ Exception in verifyNeurovideoAccess:', err);
    return { hasAccess: false, error: err };
  }
}

// Generate comprehensive report
async function generateReport(results) {
  console.log('\n\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    COMPREHENSIVE USER REPORT                   ║');
  console.log('║                     Telegram ID: 5781166218                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  console.log('\n📊 SUMMARY:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // User existence
  if (results.userCheck.exists) {
    console.log('✅ User Status: FOUND in database');
    console.log(`   - Username: @${results.userCheck.data.username || 'N/A'}`);
    console.log(`   - Name: ${results.userCheck.data.first_name || ''} ${results.userCheck.data.last_name || ''}`);
    console.log(`   - Bot: ${results.userCheck.data.bot_name || 'N/A'}`);
  } else {
    console.log('❌ User Status: NOT FOUND in database');
  }

  // Balance
  console.log(`\n💰 Balance: ${results.balance.balance.toLocaleString('ru-RU')} ⭐ stars`);

  // Subscription before
  console.log('\n📋 Subscription Status (BEFORE):');
  if (results.subscriptionBefore.hasActiveSubscription) {
    console.log(`   ✅ Active: ${results.subscriptionBefore.subscription.type}`);
    console.log(`   - Start: ${formatDate(results.subscriptionBefore.subscription.startDate)}`);
    if (results.subscriptionBefore.subscription.expirationDate) {
      console.log(`   - Expires: ${formatDate(results.subscriptionBefore.subscription.expirationDate)}`);
    } else {
      console.log(`   - Expires: Never (NEUROTESTER)`);
    }
  } else {
    console.log('   ❌ No active subscription');
  }

  // Actions taken
  console.log('\n⚡ ACTIONS TAKEN:');
  if (results.grantAction.success) {
    console.log('   ✅ NEUROVIDEO subscription granted successfully');
    console.log(`   - Invoice ID: ${results.grantAction.invId}`);
    console.log(`   - Valid for: 30 days`);
  } else if (results.subscriptionBefore.hasActiveSubscription) {
    console.log('   ℹ️  No action needed - user already has active subscription');
  } else {
    console.log('   ❌ Failed to grant subscription');
  }

  // Verification
  console.log('\n🔍 VERIFICATION (AFTER):');
  if (results.verification.hasAccess) {
    console.log('   ✅ NEUROVIDEO Access: GRANTED');
    console.log(`   - Subscription Type: ${results.verification.subscriptionType}`);
    console.log(`   - Status: ${results.verification.message}`);
  } else {
    console.log('   ❌ NEUROVIDEO Access: DENIED');
    console.log(`   - Reason: ${results.verification.message}`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📝 Report generated at:', new Date().toLocaleString('ru-RU'));
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Main execution function
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         USER MANAGEMENT SCRIPT - TELEGRAM ID: 5781166218       ║');
  console.log('║                Production Server: 212.86.115.30                ║');
  console.log('║                    Project: /root/bot-farm                     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`\n🕐 Started at: ${new Date().toLocaleString('ru-RU')}\n`);

  const results = {
    userCheck: null,
    balance: null,
    subscriptionBefore: null,
    grantAction: { success: false },
    verification: null
  };

  try {
    // Task 1: Check user existence
    results.userCheck = await checkUserExistence(TELEGRAM_ID);

    // Task 2: Check balance
    results.balance = await checkUserBalance(TELEGRAM_ID);

    // Task 3: Check subscription status (BEFORE)
    results.subscriptionBefore = await checkSubscriptionStatus(TELEGRAM_ID);

    // Task 4: Grant NEUROVIDEO subscription (only if no active subscription)
    if (!results.subscriptionBefore.hasActiveSubscription) {
      console.log('\n⚠️  No active subscription detected. Granting NEUROVIDEO...');
      results.grantAction = await grantNeurovideoSubscription(TELEGRAM_ID);
    } else {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('ℹ️  TASK 4: Skipped - User already has active subscription');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      results.grantAction = {
        success: true,
        skipped: true,
        reason: 'User already has active subscription'
      };
    }

    // Task 5: Verify access
    results.verification = await verifyNeurovideoAccess(TELEGRAM_ID);

    // Generate comprehensive report
    await generateReport(results);

    console.log('✅ All tasks completed successfully!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ CRITICAL ERROR in main execution:', error);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

// Run the script
main();
