import { logger } from '@/utils/logger'
import { rewardInviter, REFERRAL_BONUS_STARS } from './rewardInviter'
import { rewardInvited, REFERRAL_INVITED_BONUS_STARS } from './rewardInvited'

/**
 * The inviter's reward -- for the invited person's FIRST TOP-UP, not for their
 * registration.
 *
 * WHY NOT FOR REGISTRATION. Measured on our own data: out of 738 people who
 * arrived by link, **33 -- four percent** ever topped up their balance. Paying
 * for registration means paying twenty-five times over for one payer, and a
 * Telegram registration is cheap to fake.
 *
 * The market review says the same: the main reward is customarily paid for the
 * first purchase rather than for arrival, and held for the refund window. A
 * registration reward is the "weakest link", because only a fifth to a third
 * of the people who follow a link ever activate.
 *
 * THE ECONOMICS THE DECISION RESTS ON (docs/audit/referral-economics.md): an
 * invited person brings in 71 stars on average over their lifetime. That is
 * the ceiling for what an invite may cost; a sane share is 5-10%, i.e. single
 * stars when paying for registration and tens when paying for a first top-up.
 *
 * PROTECTION AGAINST PAYING TWICE already lives in `rewardInviter`: the
 * invoice id is built from the "inviter -> invited" pair, and invoice ids are
 * unique in the database. So this function may be called on every top-up -- it
 * pays exactly once.
 *
 * TWO SIDES. The bonus for the invited person (`rewardInvited`) is granted
 * from here as well, if the owner has set its amount too. The sides are
 * independent: each is enabled by its own number and carries its own invoice,
 * and a failure on one does not cancel the other -- otherwise a problem on the
 * inviter's side would silently eat the invited person's bonus. The function
 * used to be called `rewardInviterOnFirstTopUp`; that name stopped being true
 * once there were two sides.
 */
export async function rewardReferralOnFirstTopUp(params: {
  invitedTelegramId: string | number
  botName: string
}): Promise<void> {
  const { invitedTelegramId, botName } = params

  // Fast exit while the owner has set NEITHER reward amount. Checking only the
  // first side would be wrong: an enabled invited-side bonus would then never
  // fire, and nobody would see the refusal.
  if (REFERRAL_BONUS_STARS <= 0 && REFERRAL_INVITED_BONUS_STARS <= 0) return

  try {
    const { supabase } = await import('@/core/supabase')

    const { data: invited, error: invitedError } = await supabase
      .from('users')
      .select('inviter')
      .eq('telegram_id', String(invitedTelegramId))
      .maybeSingle()

    if (invitedError) {
      logger.error('❌ [Referral] Could not read the invited profile', {
        invited: String(invitedTelegramId),
        error: invitedError.message,
      })
      return
    }

    const inviterUserId = invited?.inviter
    if (!inviterUserId) return // came on their own -- nobody to reward

    // `users.inviter` stores a user_id (UUID); payment goes by telegram_id.
    const { data: inviter, error: inviterError } = await supabase
      .from('users')
      .select('telegram_id')
      .eq('user_id', inviterUserId)
      .maybeSingle()

    if (inviterError || !inviter?.telegram_id) {
      logger.error('❌ [Referral] Inviter not found by user_id', {
        invited: String(invitedTelegramId),
        inviterUserId: String(inviterUserId),
        error: inviterError?.message,
      })
      return
    }

    const outcome = await rewardInviter({
      inviterTelegramId: String(inviter.telegram_id),
      newUserTelegramId: String(invitedTelegramId),
      botName,
    })

    if (outcome.rewarded) {
      logger.info('🎁 [Referral] Reward for the invited person’s first top-up', {
        inviter: String(inviter.telegram_id),
        invited: String(invitedTelegramId),
        stars: outcome.stars,
      })
    }

    // The second side -- SEPARATELY and UNCONDITIONALLY with respect to the
    // first.
    //
    // Not in an `else` and not behind `if (outcome.rewarded)`: the inviter's
    // reward may fail for reasons of its own (they are missing from `users` --
    // 44 payers are, see docs/audit/ghost-payers.md), and tying one side to
    // the other would mean the invited person silently loses what they were
    // promised because of somebody else's trouble.
    const invitedOutcome = await rewardInvited({
      inviterTelegramId: String(inviter.telegram_id),
      invitedTelegramId: String(invitedTelegramId),
      botName,
    })

    if (invitedOutcome.rewarded) {
      logger.info('🎁 [Referral] Bonus for arriving by invitation', {
        inviter: String(inviter.telegram_id),
        invited: String(invitedTelegramId),
        stars: invitedOutcome.stars,
      })
    }
  } catch (e) {
    // The top-up already happened and matters more than the reward: never let
    // this bring it down.
    logger.error('❌ [Referral] Exception while rewarding a top-up', {
      invited: String(invitedTelegramId),
      error: e instanceof Error ? e.message : String(e),
    })
  }
}
