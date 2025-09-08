#!/usr/bin/env npx ts-node

/**
 * EMERGENCY FIX SCRIPT FOR USER 321330903
 * 
 * This script:
 * 1. Checks current subscription status for user 321330903
 * 2. Implements immediate hotfix to grant access
 * 3. Creates a backup payment record if missing
 * 4. Verifies the fix worked
 */

import { supabase } from '../src/core/supabase'
import { logger } from '../src/utils/logger'
import { getUserDetailsSubscription } from '../src/core/supabase/getUserDetailsSubscription'
import { createSuccessfulPayment } from '../src/core/supabase/createSuccessfulPayment'
import { SubscriptionType } from '../src/interfaces/subscription.interface'
import { PaymentStatus, Currency } from '../src/interfaces/payments.interface'

const TARGET_USER_ID = '321330903'

async function main() {
  console.log('🚨 EMERGENCY FIX SCRIPT FOR USER 321330903')
  console.log('=' .repeat(50))

  try {
    // Step 1: Check current status
    console.log('📊 Step 1: Checking current subscription status...')
    const currentStatus = await getUserDetailsSubscription(TARGET_USER_ID)
    
    console.log('Current status:', {
      isExist: currentStatus.isExist,
      stars: currentStatus.stars,
      subscriptionType: currentStatus.subscriptionType,
      isSubscriptionActive: currentStatus.isSubscriptionActive,
      subscriptionStartDate: currentStatus.subscriptionStartDate,
    })

    // Step 2: Check payments history
    console.log('💳 Step 2: Checking payment history...')
    const { data: payments, error: paymentsError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', TARGET_USER_ID)
      .order('created_at', { ascending: false })
      .limit(10)

    if (paymentsError) {
      console.error('❌ Error fetching payments:', paymentsError)
    } else {
      console.log(`📋 Found ${payments?.length || 0} payments:`)
      payments?.forEach((payment, index) => {
        console.log(`  ${index + 1}. ${payment.created_at} - ${payment.subscription_type} - ${payment.status} - ${payment.amount}`)
      })
    }

    // Step 3: Check if user exists
    console.log('👤 Step 3: Checking if user exists in users table...')
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', TARGET_USER_ID)
      .maybeSingle()

    if (userError) {
      console.error('❌ Error checking user:', userError)
    } else if (userData) {
      console.log('✅ User exists in users table:', userData.id)
    } else {
      console.log('❌ User NOT found in users table')
    }

    // Step 4: Apply hotfix
    if (!currentStatus.isSubscriptionActive) {
      console.log('🔧 Step 4: APPLYING EMERGENCY HOTFIX...')
      
      // Create a NEUROTESTER subscription (permanent access)
      try {
        const hotfixPayment = await createSuccessfulPayment({
          telegram_id: TARGET_USER_ID,
          amount: 999, // Special hotfix amount
          type: 'money_income',
          description: 'EMERGENCY_HOTFIX_NEUROTESTER_SUBSCRIPTION',
          bot_name: 'emergency_fix',
          service_type: 'subscription',
          model_name: 'hotfix',
          payment_method: 'HOTFIX',
          metadata: {
            is_hotfix: true,
            hotfix_reason: 'User paid but cannot access bot',
            fixed_by: 'emergency_script',
            fixed_at: new Date().toISOString(),
            original_issue: 'доступ будет недоступен'
          },
          inv_id: `hotfix_${TARGET_USER_ID}_${Date.now()}`,
          stars: 999,
          status: PaymentStatus.COMPLETED,
          currency: Currency.RUB,
        })

        if (hotfixPayment) {
          console.log('✅ Emergency payment record created:', hotfixPayment.id)
          
          // Now manually update subscription_type to NEUROTESTER
          const { error: updateError } = await supabase
            .from('payments_v2')
            .update({ 
              subscription_type: SubscriptionType.NEUROTESTER,
              payment_date: new Date().toISOString()
            })
            .eq('id', hotfixPayment.id)

          if (updateError) {
            console.error('❌ Error updating subscription type:', updateError)
          } else {
            console.log('✅ Subscription type updated to NEUROTESTER')
          }
        }
      } catch (hotfixError) {
        console.error('❌ Hotfix failed:', hotfixError)
      }

      // Alternative hotfix: Direct database insert
      console.log('🔧 Alternative hotfix: Direct database insert...')
      try {
        const { data: directInsert, error: insertError } = await supabase
          .from('payments_v2')
          .insert({
            telegram_id: TARGET_USER_ID,
            amount: 999,
            stars: 999,
            payment_method: 'EMERGENCY_HOTFIX',
            description: 'EMERGENCY_ACCESS_GRANTED',
            type: 'money_income',
            service_type: 'subscription',
            model_name: 'emergency_hotfix',
            bot_name: 'emergency_script',
            status: PaymentStatus.COMPLETED,
            metadata: {
              emergency_fix: true,
              reason: 'User access issue',
              fixed_at: new Date().toISOString()
            },
            currency: Currency.RUB,
            inv_id: `emergency_${Date.now()}`,
            subscription_type: SubscriptionType.NEUROTESTER,
            payment_date: new Date().toISOString(),
          })
          .select()
          .single()

        if (insertError) {
          console.error('❌ Direct insert failed:', insertError)
        } else {
          console.log('✅ Direct insert successful:', directInsert?.id)
        }
      } catch (directError) {
        console.error('❌ Direct hotfix error:', directError)
      }
    }

    // Step 5: Verify fix
    console.log('🔍 Step 5: Verifying fix...')
    const newStatus = await getUserDetailsSubscription(TARGET_USER_ID)
    
    console.log('New status after fix:', {
      isExist: newStatus.isExist,
      stars: newStatus.stars,
      subscriptionType: newStatus.subscriptionType,
      isSubscriptionActive: newStatus.isSubscriptionActive,
      subscriptionStartDate: newStatus.subscriptionStartDate,
    })

    // Step 6: Final verification
    if (newStatus.isSubscriptionActive) {
      console.log('🎉 SUCCESS! User 321330903 now has active subscription')
      console.log(`✅ Subscription type: ${newStatus.subscriptionType}`)
      console.log(`✅ Status: ACTIVE`)
      console.log(`✅ Balance: ${newStatus.stars} stars`)
    } else {
      console.log('❌ FIX FAILED - User still doesn\'t have active subscription')
      console.log('Manual intervention required!')
    }

    console.log('=' .repeat(50))
    console.log('🏁 Emergency fix script completed')

  } catch (error) {
    console.error('💥 Critical error in fix script:', error)
    process.exit(1)
  }
}

// Run the script
main().catch(console.error)