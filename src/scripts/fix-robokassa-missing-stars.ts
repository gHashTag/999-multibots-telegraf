/**
 * Script to find and fix Robokassa payments where stars were not credited
 * due to OutSum string/number comparison bug.
 *
 * The bug: webhook handler compared string OutSum ("500") with numeric amount (500)
 * using ===, which always returned false. Result: stars=0, balance never credited.
 *
 * How it works:
 * 1. Finds all COMPLETED Robokassa payments (original PENDING records updated by webhook)
 * 2. Checks if a corresponding balance credit record exists (created by updateUserBalance)
 * 3. If no credit record exists, creates one to credit the missing stars
 *
 * Usage: Run once after deploying the fix. Safe to run multiple times (idempotent).
 */

import { supabaseAdmin } from '@/core/supabase'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { PaymentType } from '@/interfaces/payments.interface'
import { logger } from '@/utils/logger'

const PAYMENT_OPTIONS = [
  { amount: 100, stars: 43 },
  { amount: 500, stars: 217 },
  { amount: 1000, stars: 434 },
  { amount: 2000, stars: 869 },
  { amount: 5000, stars: 2173 },
  { amount: 10000, stars: 4347 },
]

const SUBSCRIPTION_PLANS = [
  { ru_price: 1110, stars_price: 476, callback_data: 'neurophoto' },
  { ru_price: 2999, stars_price: 1303, callback_data: 'neurovideo' },
  { ru_price: 75000, stars_price: 32608, callback_data: 'neuroblogger' },
]

function getStarsForAmount(amount: number): number {
  // Check subscriptions first
  const sub = SUBSCRIPTION_PLANS.find(p => p.ru_price === amount)
  if (sub) return sub.stars_price

  // Check standard top-ups
  const opt = PAYMENT_OPTIONS.find(o => o.amount === amount)
  if (opt) return opt.stars

  return 0
}

export async function fixRobokassaMissingStars(): Promise<void> {
  logger.info('🔧 [FIX] Starting Robokassa missing stars fix...')

  // Step 1: Find all COMPLETED Robokassa payments
  const { data: completedPayments, error: fetchError } = await supabaseAdmin
    .from('payments_v2')
    .select(
      'id, inv_id, telegram_id, amount, stars, bot_name, language, subscription_type, created_at, payment_date'
    )
    .eq('payment_method', 'Robokassa')
    .eq('status', 'COMPLETED')
    .eq('type', 'MONEY_INCOME')
    .order('created_at', { ascending: false })

  if (fetchError) {
    logger.error('❌ [FIX] Failed to fetch Robokassa payments', {
      error: fetchError,
    })
    return
  }

  if (!completedPayments || completedPayments.length === 0) {
    logger.info(
      '✅ [FIX] No COMPLETED Robokassa payments found. Nothing to fix.'
    )
    return
  }

  logger.info(
    `📊 [FIX] Found ${completedPayments.length} COMPLETED Robokassa payments. Checking for missing credits...`
  )

  let fixedCount = 0
  let alreadyOkCount = 0
  let errorCount = 0

  for (const payment of completedPayments) {
    const invId = payment.inv_id

    // Step 2: Check if a balance credit record exists for this payment
    // The updateUserBalance function creates a record with description containing the InvId
    const { data: creditRecord, error: creditError } = await supabaseAdmin
      .from('payments_v2')
      .select('id')
      .eq('telegram_id', payment.telegram_id)
      .eq('type', 'MONEY_INCOME')
      .like('description', `%InvId: ${invId}%`)
      .neq('id', payment.id)
      .limit(1)

    if (creditError) {
      logger.error('❌ [FIX] Error checking credit record', {
        invId,
        error: creditError,
      })
      errorCount++
      continue
    }

    if (creditRecord && creditRecord.length > 0) {
      // Credit already exists - skip
      alreadyOkCount++
      continue
    }

    // Step 3: No credit record found - this payment was affected by the bug
    const amount = Number(payment.amount)
    const starsToCredit = getStarsForAmount(amount)

    if (starsToCredit === 0) {
      logger.warn('⚠️ [FIX] Cannot determine stars for payment', {
        invId,
        amount: payment.amount,
        telegram_id: payment.telegram_id,
      })
      errorCount++
      continue
    }

    // Check if it's a subscription (those don't get balance credits)
    const isSubscription = SUBSCRIPTION_PLANS.some(p => p.ru_price === amount)
    if (isSubscription) {
      logger.info(
        `ℹ️ [FIX] Skipping subscription payment (no balance credit needed)`,
        {
          invId,
          amount,
          telegram_id: payment.telegram_id,
        }
      )
      alreadyOkCount++
      continue
    }

    logger.info(`🔧 [FIX] Crediting missing stars for payment`, {
      invId,
      telegram_id: payment.telegram_id,
      amount,
      stars: starsToCredit,
    })

    // Credit the missing stars
    const success = await updateUserBalance(
      payment.telegram_id.toString(),
      starsToCredit,
      PaymentType.MONEY_INCOME,
      `[FIX] Пополнение баланса через Robokassa (InvId: ${invId})`,
      {
        payment_method: 'Robokassa',
        bot_name: payment.bot_name,
        language: payment.language || 'ru',
        inv_id: `fix-${invId}`,
        stars: starsToCredit,
      }
    )

    if (success) {
      fixedCount++
      logger.info(`✅ [FIX] Stars credited successfully`, {
        invId,
        telegram_id: payment.telegram_id,
        stars: starsToCredit,
      })
    } else {
      errorCount++
      logger.error(`❌ [FIX] Failed to credit stars`, {
        invId,
        telegram_id: payment.telegram_id,
        stars: starsToCredit,
      })
    }
  }

  logger.info('📊 [FIX] Robokassa missing stars fix complete', {
    total_payments: completedPayments.length,
    already_ok: alreadyOkCount,
    fixed: fixedCount,
    errors: errorCount,
  })
}

// Run if called directly
if (require.main === module) {
  fixRobokassaMissingStars()
    .then(() => {
      console.log('Done!')
      process.exit(0)
    })
    .catch(err => {
      console.error('Fatal error:', err)
      process.exit(1)
    })
}
