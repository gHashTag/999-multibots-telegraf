#!/usr/bin/env node

/**
 * User Management Script for Telegram ID: 691324065
 * Production Server: 212.86.115.30
 * Project Path: /root/bot-farm
 *
 * Actions:
 * 1. Check user existence in database
 * 2. Check current balance (getUserBalance)
 * 3. Check subscription status (getUserDetailsSubscription)
 * 4. Grant NEUROTESTER subscription if needed
 * 5. Add 50000 stars if balance is low (< 10000)
 * 6. Verify user has full access after changes
 */

const TELEGRAM_ID = '691324065'
const MIN_BALANCE_THRESHOLD = 10000
const BONUS_STARS_AMOUNT = 50000

// This script should be run on the production server via SSH
// ssh -i ~/.ssh/zomro root@212.86.115.30

async function main() {
  console.log('🚀 Starting user management for Telegram ID:', TELEGRAM_ID)
  console.log('=' .repeat(80))

  // Import required modules (these will be available on production server)
  const { supabase } = require('./dist/core/supabase/client.js')
  const { getUserBalance } = require('./dist/core/supabase/getUserBalance.js')
  const { getUserDetailsSubscription } = require('./dist/core/supabase/getUserDetailsSubscription.js')

  try {
    // STEP 1: Check user existence in users table
    console.log('\n📋 STEP 1: Checking user existence in database...')
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', TELEGRAM_ID)
      .maybeSingle()

    if (userError) {
      console.error('❌ Error checking user:', userError.message)
      throw userError
    }

    if (!userData) {
      console.log('⚠️  User NOT FOUND in users table')
      console.log('   Recommendation: User needs to be created first')
    } else {
      console.log('✅ User FOUND in users table:')
      console.log('   - ID:', userData.id)
      console.log('   - Username:', userData.username || 'N/A')
      console.log('   - First Name:', userData.first_name || 'N/A')
      console.log('   - Created At:', userData.created_at)
      console.log('   - Bot Name:', userData.bot_name || 'N/A')
    }

    // STEP 2: Check current balance
    console.log('\n💰 STEP 2: Checking user balance...')
    const currentBalance = await getUserBalance(TELEGRAM_ID)
    console.log('✅ Current Balance:', currentBalance, 'stars')

    // STEP 3: Check subscription status
    console.log('\n📊 STEP 3: Checking subscription status...')
    const userDetails = await getUserDetailsSubscription(TELEGRAM_ID)
    console.log('✅ User Details:')
    console.log('   - Exists:', userDetails.isExist)
    console.log('   - Balance:', userDetails.stars, 'stars')
    console.log('   - Subscription Type:', userDetails.subscriptionType || 'NONE')
    console.log('   - Subscription Active:', userDetails.isSubscriptionActive)
    console.log('   - Subscription Start Date:', userDetails.subscriptionStartDate || 'N/A')

    // STEP 4: Determine if actions are needed
    console.log('\n🔍 STEP 4: Analyzing user status...')
    const needsSubscription = !userDetails.isSubscriptionActive
    const needsBalance = currentBalance < MIN_BALANCE_THRESHOLD

    console.log('   - Needs NEUROTESTER subscription:', needsSubscription ? 'YES' : 'NO')
    console.log('   - Needs balance top-up:', needsBalance ? 'YES' : 'NO')

    let actionsPerformed = []

    // STEP 5: Grant NEUROTESTER subscription if needed
    if (needsSubscription) {
      console.log('\n⚡ STEP 5a: Granting NEUROTESTER subscription...')

      const { data: subscriptionResult, error: subscriptionError } = await supabase
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
          inv_id: `manual-neurotester-${Date.now()}`,
          description: `Manual NEUROTESTER subscription granted by admin for user ${TELEGRAM_ID}`,
          payment_date: new Date().toISOString(),
          is_system_payment: true,
          category: 'BONUS'
        })
        .select()

      if (subscriptionError) {
        console.error('❌ Error granting subscription:', subscriptionError.message)
      } else {
        console.log('✅ NEUROTESTER subscription granted successfully!')
        console.log('   Transaction ID:', subscriptionResult[0]?.id)
        actionsPerformed.push('NEUROTESTER subscription granted')
      }
    } else {
      console.log('\n✓ STEP 5a: User already has active subscription, skipping...')
    }

    // STEP 6: Add stars if balance is low
    if (needsBalance) {
      console.log(`\n⚡ STEP 5b: Adding ${BONUS_STARS_AMOUNT} stars to balance...`)

      const { data: starsResult, error: starsError } = await supabase
        .from('payments_v2')
        .insert({
          telegram_id: TELEGRAM_ID,
          amount: 0,
          stars: BONUS_STARS_AMOUNT,
          currency: 'XTR',
          status: 'COMPLETED',
          type: 'STAR_INCOME',
          payment_method: 'Manual Admin Grant',
          bot_name: 'neuro_blogger_bot',
          inv_id: `manual-stars-${Date.now()}`,
          description: `Manual admin grant of ${BONUS_STARS_AMOUNT} stars for user ${TELEGRAM_ID}`,
          payment_date: new Date().toISOString(),
          is_system_payment: true,
          category: 'BONUS'
        })
        .select()

      if (starsError) {
        console.error('❌ Error adding stars:', starsError.message)
      } else {
        console.log(`✅ ${BONUS_STARS_AMOUNT} stars added successfully!`)
        console.log('   Transaction ID:', starsResult[0]?.id)
        actionsPerformed.push(`${BONUS_STARS_AMOUNT} stars added`)
      }
    } else {
      console.log('\n✓ STEP 5b: User balance is sufficient, skipping...')
    }

    // STEP 7: Verify changes
    console.log('\n🔎 STEP 6: Verifying changes...')
    const updatedBalance = await getUserBalance(TELEGRAM_ID)
    const updatedDetails = await getUserDetailsSubscription(TELEGRAM_ID)

    console.log('✅ Updated User Status:')
    console.log('   - Balance:', updatedBalance, 'stars')
    console.log('   - Subscription Type:', updatedDetails.subscriptionType || 'NONE')
    console.log('   - Subscription Active:', updatedDetails.isSubscriptionActive)
    console.log('   - Subscription Start Date:', updatedDetails.subscriptionStartDate || 'N/A')

    // STEP 8: Final report
    console.log('\n' + '='.repeat(80))
    console.log('📊 FINAL REPORT - User 691324065')
    console.log('='.repeat(80))
    console.log('🎯 Actions Performed:', actionsPerformed.length > 0 ? actionsPerformed.join(', ') : 'None (user already has full access)')
    console.log('💰 Final Balance:', updatedBalance, 'stars')
    console.log('📋 Subscription:', updatedDetails.subscriptionType || 'NONE')
    console.log('✅ Subscription Active:', updatedDetails.isSubscriptionActive ? 'YES' : 'NO')
    console.log('🚀 User has full access:', updatedDetails.isSubscriptionActive && updatedBalance >= MIN_BALANCE_THRESHOLD ? 'YES ✓' : 'NO ✗')
    console.log('='.repeat(80))

  } catch (error) {
    console.error('\n❌ CRITICAL ERROR:', error.message)
    console.error('Stack:', error.stack)
    process.exit(1)
  }

  process.exit(0)
}

main()
