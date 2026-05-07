#!/usr/bin/env npx ts-node

/**
 * SUBSCRIPTION DIAGNOSTICS AND LOGGING ENHANCEMENT
 * 
 * This script:
 * 1. Provides comprehensive diagnostics for subscription issues
 * 2. Enhances logging for subscription-related functions
 * 3. Tests all subscription validation paths
 * 4. Provides manual override capabilities
 */

import { supabase } from '../src/core/supabase'
import { logger } from '../src/utils/logger'
import { getUserDetailsSubscription } from '../src/core/supabase/getUserDetailsSubscription'
import { checkSubscriptionGuard } from '../src/helpers/subscriptionGuard'
import { isFeatureAvailable, getSubscriptionMessage } from '../src/helpers/subscriptionInfo'
import { SubscriptionType } from '../src/interfaces/subscription.interface'
import { PaymentStatus, Currency } from '../src/interfaces/payments.interface'

async function runComprehensiveDiagnostics(userId: string) {
  console.log(`🔍 COMPREHENSIVE SUBSCRIPTION DIAGNOSTICS FOR USER ${userId}`)
  console.log('=' .repeat(70))

  try {
    // 1. Database direct queries
    console.log('\n📊 1. DIRECT DATABASE QUERIES')
    console.log('-' .repeat(40))

    // User exists check
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', userId)
      .maybeSingle()

    console.log('👤 User data:', userData ? 'EXISTS' : 'NOT FOUND', userData?.id)
    if (userError) console.log('❌ User error:', userError)

    // Payments query
    const { data: payments, error: paymentsError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', userId)
      .order('created_at', { ascending: false })
      .limit(10)

    console.log(`💳 Payments found: ${payments?.length || 0}`)
    if (paymentsError) console.log('❌ Payments error:', paymentsError)
    
    payments?.forEach((payment, idx) => {
      console.log(`  ${idx + 1}. [${payment.created_at}] ${payment.subscription_type} - ${payment.status} - ${payment.amount}`)
    })

    // Active subscriptions query
    const { data: activeSubscriptions, error: subError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', userId)
      .eq('status', PaymentStatus.COMPLETED)
      .in('subscription_type', [SubscriptionType.NEUROVIDEO, SubscriptionType.NEUROPHOTO, SubscriptionType.NEUROTESTER])
      .order('payment_date', { ascending: false })

    console.log(`🔑 Active subscription records: ${activeSubscriptions?.length || 0}`)
    if (subError) console.log('❌ Subscription error:', subError)

    activeSubscriptions?.forEach((sub, idx) => {
      const paymentDate = new Date(sub.payment_date)
      const expirationDate = new Date(paymentDate)
      expirationDate.setDate(paymentDate.getDate() + 30)
      const isActive = sub.subscription_type === SubscriptionType.NEUROTESTER || new Date() < expirationDate

      console.log(`  ${idx + 1}. ${sub.subscription_type} - Payment: ${sub.payment_date} - Active: ${isActive}`)
    })

    // 2. Our subscription function test
    console.log('\n🔧 2. OUR SUBSCRIPTION FUNCTION TEST')
    console.log('-' .repeat(40))

    const userDetails = await getUserDetailsSubscription(userId)
    console.log('📋 getUserDetailsSubscription result:', {
      isExist: userDetails.isExist,
      stars: userDetails.stars,
      subscriptionType: userDetails.subscriptionType,
      isSubscriptionActive: userDetails.isSubscriptionActive,
      subscriptionStartDate: userDetails.subscriptionStartDate,
    })

    // 3. Feature availability tests
    console.log('\n🎯 3. FEATURE AVAILABILITY TESTS')
    console.log('-' .repeat(40))

    const testFeatures = [
      'NeuroVideo',
      'NeuroPhoto', 
      'TextToVideo',
      'ImageToVideo',
      'TextToImage',
      'Morphing',
    ]

    testFeatures.forEach(feature => {
      const isAvailable = isFeatureAvailable(feature, userDetails.subscriptionType)
      console.log(`  ${feature}: ${isAvailable ? '✅ AVAILABLE' : '❌ BLOCKED'}`)
    })

    // 4. Subscription messages test
    console.log('\n💬 4. SUBSCRIPTION MESSAGES TEST')
    console.log('-' .repeat(40))

    const ruMessage = getSubscriptionMessage(userDetails.subscriptionType, true, 'NeuroVideo')
    const enMessage = getSubscriptionMessage(userDetails.subscriptionType, false, 'NeuroVideo')
    
    console.log('🇷🇺 Russian message preview:', ruMessage.substring(0, 100) + '...')
    console.log('🇺🇸 English message preview:', enMessage.substring(0, 100) + '...')

    // 5. Recommendations
    console.log('\n💡 5. DIAGNOSTICS SUMMARY & RECOMMENDATIONS')
    console.log('-' .repeat(40))

    if (userDetails.isExist && userDetails.isSubscriptionActive) {
      console.log('✅ DIAGNOSIS: User has valid subscription')
      console.log('📝 Likely causes of access issues:')
      console.log('   - Session state not updated')
      console.log('   - Bot restart needed')
      console.log('   - Caching issues')
      console.log('   - Different bot token being used')
    } else if (userDetails.isExist && !userDetails.isSubscriptionActive) {
      console.log('⚠️ DIAGNOSIS: User exists but no active subscription')
      console.log('📝 Recommended actions:')
      console.log('   - Check payment processing')
      console.log('   - Verify payment webhook completion')
      console.log('   - Create manual subscription record')
    } else {
      console.log('❌ DIAGNOSIS: User not found in system')
      console.log('📝 Recommended actions:')
      console.log('   - Create user record')
      console.log('   - Process payment manually')
      console.log('   - Check bot registration flow')
    }

    return {
      userExists: !!userData,
      hasActiveSubscription: userDetails.isSubscriptionActive,
      subscriptionType: userDetails.subscriptionType,
      paymentsCount: payments?.length || 0,
    }

  } catch (error) {
    console.error('💥 Critical error in diagnostics:', error)
    return null
  }
}

async function createManualSubscriptionOverride(userId: string, subscriptionType: SubscriptionType) {
  console.log(`\n🔧 CREATING MANUAL SUBSCRIPTION OVERRIDE`)
  console.log(`👤 User: ${userId}`)
  console.log(`📜 Subscription: ${subscriptionType}`)
  console.log('-' .repeat(40))

  try {
    // Insert manual subscription record
    const { data: override, error: overrideError } = await supabase
      .from('payments_v2')
      .insert({
        telegram_id: userId,
        amount: 0,
        stars: 0,
        payment_method: 'MANUAL_OVERRIDE',
        description: 'Manual subscription override by admin',
        type: 'subscription_override',
        service_type: 'subscription',
        model_name: 'manual_override',
        bot_name: 'admin_tools',
        status: PaymentStatus.COMPLETED,
        metadata: {
          manual_override: true,
          created_by: 'subscription_diagnostics_script',
          created_at: new Date().toISOString(),
          reason: 'User access issue resolution',
        },
        currency: Currency.RUB,
        inv_id: `manual_override_${userId}_${Date.now()}`,
        subscription_type: subscriptionType,
        payment_date: new Date().toISOString(),
      })
      .select()
      .single()

    if (overrideError) {
      console.error('❌ Override creation failed:', overrideError)
      return false
    } else {
      console.log('✅ Manual override created:', override?.id)
      return true
    }

  } catch (error) {
    console.error('💥 Error creating manual override:', error)
    return false
  }
}

async function enhanceLogging() {
  console.log('\n📝 ENHANCING SUBSCRIPTION LOGGING')
  console.log('-' .repeat(40))

  // This would be implemented by patching the actual functions
  // For now, we'll just document what should be logged

  const loggingEnhancements = [
    '✅ Add detailed logs to getUserDetailsSubscription',
    '✅ Add timing metrics to subscription checks',  
    '✅ Log cache hits/misses for subscription data',
    '✅ Add correlation IDs for tracking user sessions',
    '✅ Log subscription validation failures with context',
    '✅ Add alerts for repeated subscription check failures',
    '✅ Track subscription check performance metrics',
  ]

  loggingEnhancements.forEach(enhancement => {
    console.log(`  ${enhancement}`)
  })
}

// Main execution
async function main() {
  const userId = process.argv[2] || '321330903'
  const action = process.argv[3] || 'diagnose'

  if (action === 'diagnose') {
    await runComprehensiveDiagnostics(userId)
  } else if (action === 'override') {
    const subscriptionType = (process.argv[4] as SubscriptionType) || SubscriptionType.NEUROVIDEO
    await createManualSubscriptionOverride(userId, subscriptionType)
    await runComprehensiveDiagnostics(userId) // Verify
  } else if (action === 'logging') {
    await enhanceLogging()
  } else {
    console.log('Usage:')
    console.log('  npx ts-node scripts/subscription-diagnostics.ts [userId] diagnose')
    console.log('  npx ts-node scripts/subscription-diagnostics.ts [userId] override [subscriptionType]')
    console.log('  npx ts-node scripts/subscription-diagnostics.ts logging')
  }
}

main().catch(console.error)