import { supabase } from '../src/core/supabase/supabase'
import { logger } from '../src/utils/logger'
import { SubscriptionType } from '../src/interfaces/subscription.interface'
import { PaymentStatus } from '../src/interfaces/payment.interface'
import { adminRenewSubscription } from '../src/core/supabase/adminRenewSubscription'
import fs from 'fs'
import path from 'path'

interface RenewalConfig {
  subscriptionType: SubscriptionType
  durationDays: number
  botName: string
  reason: string
  specificUsers?: number[] // Optional array of specific telegram_ids to renew
}

async function massRenewSubscriptions(config: RenewalConfig) {
  try {
    logger.info('🔄 Starting mass subscription renewal', { config })

    // Fetch all subscriptions
    const { data: subscriptions, error } = await supabase
      .from('payments_v2')
      .select('telegram_id, subscription_type, payment_date, status')
      .eq('subscription_type', config.subscriptionType)
      .eq('status', PaymentStatus.COMPLETED)
      .order('payment_date', { ascending: false })

    if (error) {
      logger.error('❌ Error fetching subscriptions', { error })
      return
    }

    if (!subscriptions || subscriptions.length === 0) {
      logger.warn('⚠️ No subscriptions found for renewal')
      return
    }

    // Filter unique users if specific users are provided
    const uniqueUsers = config.specificUsers
      ? subscriptions.filter(sub =>
          config.specificUsers?.includes(sub.telegram_id)
        )
      : [...new Set(subscriptions.map(sub => sub.telegram_id))]

    logger.info('📊 Processing renewals', {
      totalSubscriptions: subscriptions.length,
      uniqueUsers: uniqueUsers.length,
    })

    const results = {
      success: [] as number[],
      failed: [] as { telegram_id: number; error: string }[],
      skipped: [] as number[],
    }

    // Process each unique user
    for (const telegramId of uniqueUsers) {
      try {
        const result = await adminRenewSubscription({
          telegram_id: telegramId,
          subscription_type: config.subscriptionType,
          duration_days: config.durationDays,
          bot_name: config.botName,
          reason: config.reason,
        })

        if (result.success) {
          results.success.push(telegramId)
          logger.info('✅ Successfully renewed subscription', { telegramId })
        } else {
          results.failed.push({
            telegram_id: telegramId,
            error: result.error || 'Unknown error',
          })
          logger.error('❌ Failed to renew subscription', {
            telegramId,
            error: result.error,
          })
        }
      } catch (error) {
        results.failed.push({
          telegram_id: telegramId,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        logger.error('❌ Error processing renewal', { telegramId, error })
      }
    }

    // Save results to file
    const artifactsDir = path.join(process.cwd(), 'artifacts')
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir)
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const resultsPath = path.join(
      artifactsDir,
      `renewal-results-${timestamp}.json`
    )

    fs.writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          timestamp,
          config,
          statistics: {
            total: uniqueUsers.length,
            success: results.success.length,
            failed: results.failed.length,
            skipped: results.skipped.length,
          },
          results,
        },
        null,
        2
      )
    )

    logger.info('💾 Results saved', { path: resultsPath })
    logger.info('📊 Renewal Summary', {
      total: uniqueUsers.length,
      success: results.success.length,
      failed: results.failed.length,
      skipped: results.skipped.length,
    })
  } catch (error) {
    logger.error('❌ Unexpected error in mass renewal', { error })
  }
}

// Example usage:
// massRenewSubscriptions({
//   subscriptionType: SubscriptionType.NEUROVIDEO,
//   durationDays: 30,
//   botName: 'neuro_blogger_bot',
//   reason: 'Mass renewal for active users',
//   specificUsers: [352374518] // Optional: specify users to renew
// })
