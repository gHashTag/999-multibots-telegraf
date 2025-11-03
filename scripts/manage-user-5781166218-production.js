#!/usr/bin/env node
/**
 * Production User Management Script for Telegram ID: 5781166218
 * Runs directly on production server at /root/bot-farm
 *
 * This script uses the Supabase client already available in the production environment
 */

// Production environment detection
const isProduction = process.env.NODE_ENV === 'production' || process.cwd().includes('/root/');

console.log('Environment:', isProduction ? 'PRODUCTION' : 'DEVELOPMENT');
console.log('Working directory:', process.cwd());

// Dynamic require based on environment
let supabase;
let createClient;

if (isProduction) {
  // On production server - use compiled dist files
  try {
    const supabaseModule = require('../dist/core/supabase/index.js');
    supabase = supabaseModule.supabase;
    console.log('✅ Loaded Supabase from production dist/core/supabase/index.js');
  } catch (err) {
    console.error('❌ Failed to load Supabase from dist:', err.message);
    console.log('Trying alternative method with @supabase/supabase-js...');

    const { createClient: createClientFn } = require('@supabase/supabase-js');
    createClient = createClientFn;

    // Use environment variables
    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yuukfqcsdhkyxegfwlcb.supabase.co';
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1dWtmcWNzZGhreXhlZ2Z3bGNiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNTcyNDg0MywiZXhwIjoyMDUxMzAwODQzfQ.ilyzrMPwTYrjZfn3FZBJBM1GYTk-gQTKY9Qr86-KP_o';

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    console.log('✅ Created Supabase client with environment credentials');
  }
} else {
  // On local machine - create client directly
  const { createClient: createClientFn } = require('@supabase/supabase-js');
  const SUPABASE_URL = 'https://yuukfqcsdhkyxegfwlcb.supabase.co';
  const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1dWtmcWNzZGhreXhlZ2Z3bGNiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNTcyNDg0MywiZXhwIjoyMDUxMzAwODQzfQ.ilyzrMPwTYrjZfn3FZBJBM1GYTk-gQTKY9Qr86-KP_o';
  supabase = createClientFn(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  console.log('✅ Created Supabase client for local environment');
}

const TELEGRAM_ID = '5781166218';

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

// Task 1: Check user existence
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
      console.error('❌ Error:', error.message);
      return { exists: false, data: null, error };
    }

    if (data) {
      console.log('✅ User FOUND:');
      console.log('   - ID:', data.id);
      console.log('   - Telegram ID:', data.telegram_id);
      console.log('   - Username:', data.username || 'N/A');
      console.log('   - Name:', `${data.first_name || ''} ${data.last_name || ''}`.trim() || 'N/A');
      console.log('   - Bot:', data.bot_name || 'N/A');
      console.log('   - Created:', formatDate(data.created_at));
      console.log('   - Subscription field:', data.subscription || 'N/A');
      return { exists: true, data };
    } else {
      console.log('❌ User NOT FOUND');
      return { exists: false, data: null };
    }
  } catch (err) {
    console.error('❌ Exception:', err.message);
    return { exists: false, data: null, error: err };
  }
}

// Task 2: Check balance
async function checkUserBalance(telegramId) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💰 TASK 2: Checking user balance');
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
    console.log(`✅ Balance: ${stars.toLocaleString('ru-RU')} ⭐ stars`);

    // Get recent transactions
    const { data: payments } = await supabase
      .from('payments_v2')
      .select('type, stars, amount, currency, payment_date, description, status')
      .eq('telegram_id', telegramId)
      .order('payment_date', { ascending: false })
      .limit(5);

    if (payments && payments.length > 0) {
      console.log('\n📊 Recent transactions:');
      payments.forEach((p, idx) => {
        console.log(`   ${idx + 1}. ${formatDate(p.payment_date)} | ${p.type} | ${p.stars || 0}⭐ | ${p.status}`);
      });
    }

    return { balance: stars };
  } catch (err) {
    console.error('❌ Exception:', err.message);
    return { balance: 0, error: err };
  }
}

// Task 3: Check subscription status
async function checkSubscriptionStatus(telegramId) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 TASK 3: Checking subscription status');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const subscriptionPriority = ['NEUROTESTER', 'NEUROVIDEO', 'NEUROPHOTO'];
  const SUBSCRIPTION_DURATION_DAYS = 30;

  for (const subscriptionType of subscriptionPriority) {
    const { data: subData, error } = await supabase
      .from('payments_v2')
      .select('subscription_type, payment_date, status')
      .eq('telegram_id', telegramId)
      .eq('status', 'COMPLETED')
      .eq('subscription_type', subscriptionType)
      .order('payment_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !subData) continue;

    console.log(`🔍 Found ${subscriptionType}:`, formatDate(subData.payment_date));

    let isActive = false;
    let expirationDate = null;

    if (subscriptionType === 'NEUROTESTER') {
      isActive = true;
      console.log('   ✅ NEUROTESTER is PERMANENT (always active)');
    } else {
      const paymentDate = new Date(subData.payment_date);
      const now = new Date();
      expirationDate = new Date(paymentDate);
      expirationDate.setDate(paymentDate.getDate() + SUBSCRIPTION_DURATION_DAYS);
      isActive = now < expirationDate;

      if (isActive) {
        console.log(`   ✅ ${subscriptionType} is ACTIVE (expires ${formatDate(expirationDate)})`);
      } else {
        console.log(`   ❌ ${subscriptionType} EXPIRED (${formatDate(expirationDate)})`);
      }
    }

    if (isActive) {
      console.log('\n✅ ACTIVE SUBSCRIPTION FOUND');
      return {
        hasActiveSubscription: true,
        subscription: {
          type: subscriptionType,
          startDate: subData.payment_date,
          expirationDate: expirationDate ? expirationDate.toISOString() : null,
          isActive: true
        }
      };
    }
  }

  console.log('\n❌ NO ACTIVE SUBSCRIPTION');
  return { hasActiveSubscription: false, subscription: null };
}

// Task 4: Grant NEUROVIDEO subscription
async function grantNeurovideoSubscription(telegramId) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎁 TASK 4: Granting NEUROVIDEO subscription');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

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
    bot_name: 'neuro_blogger_bot',
    inv_id: invId,
    is_system_payment: true,
    description: 'Manual NEUROVIDEO grant by admin (script)',
    payment_date: now,
    created_at: now
  };

  console.log('📦 Granting NEUROVIDEO subscription...');
  console.log('   - Invoice ID:', invId);
  console.log('   - Valid for: 30 days');

  const { data, error } = await supabase
    .from('payments_v2')
    .insert([subscriptionData])
    .select();

  if (error) {
    console.error('❌ Error:', error.message);
    return { success: false, error };
  }

  console.log('\n✅ NEUROVIDEO subscription granted successfully!');
  console.log('   - Record ID:', data[0]?.id || 'N/A');

  const expirationDate = new Date(now);
  expirationDate.setDate(expirationDate.getDate() + 30);
  console.log('   - Expires:', formatDate(expirationDate));

  return { success: true, data: data[0], invId };
}

// Task 5: Verify access
async function verifyNeurovideoAccess(telegramId) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 TASK 5: Verifying NEUROVIDEO access');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const subscriptionCheck = await checkSubscriptionStatus(telegramId);

  if (subscriptionCheck.hasActiveSubscription) {
    const sub = subscriptionCheck.subscription;

    if (sub.type === 'NEUROVIDEO' || sub.type === 'NEUROTESTER') {
      console.log('\n✅ VERIFICATION SUCCESSFUL');
      console.log('   - Subscription:', sub.type);
      console.log('   - NEUROVIDEO access: GRANTED ✅');

      return { hasAccess: true, subscriptionType: sub.type };
    }
  }

  console.log('\n❌ VERIFICATION FAILED');
  console.log('   - NEUROVIDEO access: DENIED ❌');
  return { hasAccess: false };
}

// Main execution
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║    USER MANAGEMENT SCRIPT - Telegram ID: 5781166218            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`Started: ${new Date().toLocaleString('ru-RU')}\n`);

  const results = {};

  try {
    // Execute all tasks
    results.userCheck = await checkUserExistence(TELEGRAM_ID);
    results.balance = await checkUserBalance(TELEGRAM_ID);
    results.subscriptionBefore = await checkSubscriptionStatus(TELEGRAM_ID);

    // Grant subscription if needed
    if (!results.subscriptionBefore.hasActiveSubscription) {
      console.log('\n⚠️  No active subscription - granting NEUROVIDEO...');
      results.grantAction = await grantNeurovideoSubscription(TELEGRAM_ID);
    } else {
      console.log('\nℹ️  User already has active subscription - skipping grant');
      results.grantAction = { success: true, skipped: true };
    }

    // Verify access
    results.verification = await verifyNeurovideoAccess(TELEGRAM_ID);

    // Summary
    console.log('\n\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                        SUMMARY REPORT                          ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log('📊 User Status:', results.userCheck.exists ? '✅ Found' : '❌ Not found');
    console.log('💰 Balance:', results.balance.balance.toLocaleString('ru-RU'), '⭐ stars');
    console.log('📋 Subscription:', results.verification.hasAccess ? '✅ Active' : '❌ Inactive');
    console.log('🎯 NEUROVIDEO Access:', results.verification.hasAccess ? '✅ GRANTED' : '❌ DENIED');

    console.log('\n✅ Script completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ CRITICAL ERROR:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run
main();
