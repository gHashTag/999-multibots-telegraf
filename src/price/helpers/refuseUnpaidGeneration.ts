/**
 * ONE place that turns a refused charge into the right refusal.
 *
 * `processBalanceOperation` answers `success: false` for four unrelated
 * reasons. Before this helper, callers did one of two wrong things with that
 * answer:
 *
 *   1. Ignored it. generateFluxKontextPro, generateQwenImageEdit and
 *      generateSeedEdit3 read the result, wrote `charged = result.success`,
 *      and then replied that the image was being processed and called the paid
 *      provider REGARDLESS. A customer with an empty wallet was told they had
 *      no stars (processBalanceOperation sends that message itself) and was
 *      then served the paid generation anyway, free. The refund guard beside
 *      it -- `if (charged)` -- proves somebody had reasoned about the
 *      insufficient-funds path here; they protected the refund side and never
 *      built the refusal.
 *
 *   2. Flattened it. generateFluxKontextMax threw `new Error('Not enough
 *      stars')` for all four, discarding `balanceCheck.error`. Downstream,
 *      five `.includes('Not enough stars')` catchers render that as a top-up
 *      prompt -- so a customer WITH stars whose balance write failed was told
 *      they were broke, and an operator incident was filed as a broke
 *      customer.
 *
 * The distinction is now measured at the source (`insufficientFunds`, a field
 * that already existed and was already documented for this, used by the video
 * path for a while) instead of re-derived downstream from user-facing prose in
 * two languages.
 *
 * WHAT THIS DOES NOT DO: send a message. On the insufficient-funds path
 * `processBalanceOperation` has ALREADY messaged the customer, with the
 * top-up buttons attached. A second message here would be the sixth thing a
 * person sees for one refusal.
 */
import { BalanceOperationResult } from '@/interfaces'
import { logger } from '@/utils/logger'

/**
 * The cross-file sentinel. Six services throw it and five catch sites match it
 * with `.includes(...)` to decide whether to show a top-up prompt. It is a
 * protocol, so it is spelled once, here, and only ever thrown for a refusal
 * that really is about the customer's balance.
 */
export const INSUFFICIENT_FUNDS_SENTINEL = 'Not enough stars'

export class BalanceRefusedError extends Error {
  /** `true` only when the customer is genuinely short of stars. */
  readonly insufficientFunds: boolean
  /** What `processBalanceOperation` actually said, never flattened. */
  readonly reason: string
  /** `true` when the customer has already been told and must not be told twice. */
  readonly userAlreadyNotified: boolean

  constructor(params: {
    message: string
    insufficientFunds: boolean
    reason: string
    userAlreadyNotified: boolean
  }) {
    super(params.message)
    this.name = 'BalanceRefusedError'
    this.insufficientFunds = params.insufficientFunds
    this.reason = params.reason
    this.userAlreadyNotified = params.userAlreadyNotified
  }
}

/**
 * Refuse a generation whose charge did not go through.
 *
 * Returns normally when the charge succeeded, so the call reads as a guard:
 *
 *     const balanceResult = await processBalanceOperation({...})
 *     refuseUnpaidGeneration(balanceResult, { service: 'FluxKontextPro', telegram_id })
 *     // past this line the work is paid for
 *
 * @throws BalanceRefusedError when `result.success` is not `true`.
 */
export function refuseUnpaidGeneration(
  result: BalanceOperationResult | null | undefined,
  context: { service: string; telegram_id: string | number }
): void {
  if (result?.success === true) return

  // A missing result is not a paid generation. Treating `undefined` as "fine"
  // is how the ignore-the-answer defect read to its authors in the first place.
  const reason = result?.error || 'no result from processBalanceOperation'
  const insufficientFunds = result?.insufficientFunds === true

  if (insufficientFunds) {
    // Expected, routine, and the customer has already been told with buttons.
    // info, not error: this is a wallet, not an incident, and every level above
    // info on this path is a Telegram alert to the owner (utils/logger.ts).
    logger.info(`[${context.service}] refused: the balance is short`, {
      telegram_id: context.telegram_id,
      currentBalance: result?.currentBalance,
      modePrice: result?.modePrice,
    })
    throw new BalanceRefusedError({
      message: INSUFFICIENT_FUNDS_SENTINEL,
      insufficientFunds: true,
      reason,
      userAlreadyNotified: true,
    })
  }

  // Not the customer's fault. This one IS an incident and does page -- and it
  // must NOT carry the sentinel, or the catchers upstream will tell a paying
  // customer they are broke.
  logger.error(
    `[${context.service}] the charge failed for an operator reason`,
    {
      telegram_id: context.telegram_id,
      reason,
      currentBalance: result?.currentBalance,
      modePrice: result?.modePrice,
      hint: 'balance write, price calculation, or an exception -- not the wallet',
    }
  )
  throw new BalanceRefusedError({
    message: `Charge failed: ${reason}`,
    insufficientFunds: false,
    reason,
    userAlreadyNotified: false,
  })
}
