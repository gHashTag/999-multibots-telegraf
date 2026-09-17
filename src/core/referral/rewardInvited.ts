import { PaymentType } from '@/interfaces/payments.interface'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'
import type { RewardOutcome } from './rewardInviter'

/**
 * The reward for the INVITED person -- the second side of the same programme.
 *
 * WHY A SECOND SIDE. In a one-sided programme, following the link gives the
 * person being invited nothing: the whole benefit sits with the inviter.
 * Industry practice is to pay both sides, and the market review says the same
 * (docs/audit/referral-economics.md).
 *
 * HONESTLY ABOUT THE EVIDENCE. How much this lifts conversion HERE is NOT
 * MEASURED, and cannot be: the one-sided reward has never once fired for us
 * (out of 17,136 payments not a single one is a referral reward). This is a
 * hypothesis borrowed from other people's practice, not a conclusion drawn
 * from our data. It should be switched on that way too: after the first side
 * starts working, and with its own number, so the two can be compared.
 *
 * WHY A SEPARATE NUMBER RATHER THAN THE SAME ONE. Because doubling steps
 * outside the budget that was calculated for one side. With 33 payers among
 * the invited:
 *
 *   100 stars to one side    = 3,300 stars  =  6% of revenue
 *   200 stars to one side    = 6,600        = 13%
 *   100 + 100 to both        = 6,600        = 13%
 *   200 + 200 to both        = 13,200       = 26%  <- above the ceiling
 *
 * The industry guide is 5-10% of the average payment per side, with 15% as the
 * ceiling. So a two-sided programme is NOT "turn on one more reward" but SPLIT
 * the budget: say 60 to the inviter and 40 to the invited instead of 100 to
 * one. Adding both numbers up and checking them against the ceiling is the
 * owner's call -- which is why the amount is its own constant and is written
 * down in docs/OWNER-DECISIONS.md.
 *
 * PROTECTION AGAINST PAYING TWICE is the same as on the first side: the
 * invoice id is built from the pair and is therefore identical on every
 * repeat, and invoice ids are unique in the database. The second row is
 * refused (code 23505).
 *
 * ZERO BY DEFAULT: until the owner sets an amount, nothing happens at all.
 */
export const REFERRAL_INVITED_BONUS_STARS = Math.max(
  0,
  Number(process.env.REFERRAL_INVITED_BONUS_STARS ?? 0) || 0
)

/** Tells "this reward was already paid" apart from a genuine failure. */
function isDuplicate(error?: string): boolean {
  return Boolean(
    error && (error.includes('23505') || /duplicate key/i.test(error))
  )
}

/**
 * The invited side's invoice id. It differs from the inviter's by its prefix:
 * otherwise the two rewards for one pair would collide on the unique index and
 * the second side would silently get nothing.
 */
export function invitedInvoiceId(
  inviterTelegramId: string | number,
  invitedTelegramId: string | number
): string {
  return `referral-invited-${inviterTelegramId}-${invitedTelegramId}`
}

export async function rewardInvited(params: {
  inviterTelegramId: string | number
  invitedTelegramId: string | number
  botName: string
}): Promise<RewardOutcome> {
  const { inviterTelegramId, invitedTelegramId, botName } = params

  if (REFERRAL_INVITED_BONUS_STARS <= 0) {
    return { rewarded: false, reason: 'disabled' }
  }

  if (String(inviterTelegramId) === String(invitedTelegramId)) {
    return { rewarded: false, reason: 'failed', error: 'self-invite' }
  }

  const { directPaymentProcessor } = await import(
    '@/core/supabase/directPayment'
  )

  const result = await directPaymentProcessor({
    telegram_id: String(invitedTelegramId),
    amount: REFERRAL_INVITED_BONUS_STARS,
    type: PaymentType.MONEY_INCOME,
    description: `🎁 Бонус за приход по приглашению: ${REFERRAL_INVITED_BONUS_STARS} звёзд`,
    bot_name: botName,
    service_type: ModeEnum.StartScene,
    inv_id: invitedInvoiceId(inviterTelegramId, invitedTelegramId),
    metadata: {
      category: 'BONUS',
      is_referral_reward: true,
      referral_side: 'invited',
      inviter_telegram_id: String(inviterTelegramId),
      stars_granted: REFERRAL_INVITED_BONUS_STARS,
    },
  })

  if (result.success) {
    logger.info('🎁 [Referral] Invited-side bonus granted', {
      inviter: String(inviterTelegramId),
      invited: String(invitedTelegramId),
      stars: REFERRAL_INVITED_BONUS_STARS,
    })
    return { rewarded: true, stars: REFERRAL_INVITED_BONUS_STARS }
  }

  if (isDuplicate(result.error)) {
    logger.info('🔁 [Referral] Invited-side bonus for this pair already paid', {
      inviter: String(inviterTelegramId),
      invited: String(invitedTelegramId),
    })
    return { rewarded: false, reason: 'already' }
  }

  logger.error('❌ [Referral] Failed to grant the invited-side bonus', {
    inviter: String(inviterTelegramId),
    invited: String(invitedTelegramId),
    error: result.error,
  })
  return { rewarded: false, reason: 'failed', error: result.error }
}
