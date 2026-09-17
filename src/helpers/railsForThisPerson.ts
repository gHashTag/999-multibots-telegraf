/**
 * THE PAYMENT METHOD A PERSON ALREADY CHOSE IS NOT THROWN AWAY.
 *
 * The mini app's paywall asks for a plan AND a way to pay -- card, Stars, TON --
 * and sends the person to the bot with both in the start parameter. Until
 * yesterday the bot dropped the whole payload; now it lands them in front of
 * the plan list, which is a large improvement and still loses half of what they
 * said. They picked "card" and were shown whatever the bot shows by default.
 *
 * THE RULE, AND WHY IT ONLY NARROWS.
 *
 * `shouldShowRubles` exists because some bots in this farm must not offer
 * roubles at all -- that is a property of the bot, not a preference. A person's
 * choice may therefore only narrow what is offered, never widen it: asking for
 * roubles where roubles are forbidden shows Stars, exactly as before.
 *
 * Asking for Stars, on the other hand, hides the rouble buttons -- somebody who
 * already said how they want to pay should not have to say it twice.
 */

/** What the mini app's paywall can send. Anything else is treated as no choice. */
export type PayMethod = 'robokassa' | 'stars' | 'ton'

export function payMethodOf(raw: string | null | undefined): PayMethod | null {
  const t = (raw ?? '').trim().toLowerCase()
  return t === 'robokassa' || t === 'stars' || t === 'ton' ? t : null
}

/**
 * Should the rouble prices be shown to this person, on this bot.
 *
 * `allowed` is the bot's own answer (shouldShowRubles). `chosen` is what the
 * person picked in the mini app, if anything.
 */
export function showRublesTo(
  allowed: boolean,
  chosen: string | null | undefined
): boolean {
  if (!allowed) return false
  const method = payMethodOf(chosen)
  if (!method) return true
  return method === 'robokassa'
}
