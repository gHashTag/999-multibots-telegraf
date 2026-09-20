import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'

/**
 * SHOULD THIS PERSON BE OFFERED ROUBLES.
 *
 * Two conditions, and both must hold.
 *
 * ── THE PERSON'S LANGUAGE (owner, 2026-09-20) ──────────────────────────────
 *
 * Roubles are shown only to somebody who speaks Russian. A card payment in
 * roubles is useless to a person outside that world: Robokassa's page is in
 * Russian, it wants a Russian card, and offering it to an English-speaking
 * person is a door that opens onto a wall. Worse than useless, in fact --
 * every extra button on a paywall is somewhere to hesitate, and this one
 * cannot be walked through at all.
 *
 * The language comes from `isRussianFromState`, which is the one place that
 * knows it: the middleware puts the stored choice in `ctx.state`, and the
 * fallback is Telegram's own `language_code`. Reading `ctx.from.language_code`
 * here directly would ignore a person who has since switched language in the
 * bot -- the same split-brain that the centralised helper exists to prevent.
 *
 * ── AND THE BOT ────────────────────────────────────────────────────────────
 *
 * One bot of the farm sells no roubles at all. That rule predates this one and
 * is kept: a bot that cannot take roubles must not show them to anybody,
 * whatever language they speak.
 *
 * ── WHAT A REFUSAL MUST NOT DO ─────────────────────────────────────────────
 *
 * Hiding roubles never leaves a person without a way to pay: Stars work
 * everywhere, and the caller shows them regardless. This function decides
 * which doors to draw, never whether there is a door.
 */
export function shouldShowRubles(ctx: MyContext): boolean {
  const botInfo = ctx.botInfo

  /*
   * A bot that cannot take roubles. Checked first because it is a property of
   * the cashier, not of the person, and it overrides everything below.
   */
  const botIdentifier = botInfo?.username || botInfo?.id?.toString()
  if (botIdentifier === 'NeurostylistShtogrina_bot') return false

  if (!botInfo) {
    /*
     * No botInfo is a broken context, not a person who wants roubles. It used
     * to default to `true` "so as not to break other bots"; with the language
     * rule that default would show a rouble cashier to an English speaker
     * precisely when we know least about them. The language check below still
     * applies, so an unknown bot is now judged by the person alone.
     */
    logger.warn('[shouldShowRubles] no botInfo; judging by the person alone', {
      telegram_id: ctx.from?.id,
      scene: ctx.scene?.current?.id,
    })
  }

  return isRussianFromState(ctx)
}
