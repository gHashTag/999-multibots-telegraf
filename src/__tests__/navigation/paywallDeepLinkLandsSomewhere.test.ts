/**
 * THE PAYWALL'S BUTTONS HAD NOWHERE TO LAND.
 *
 * The mini app offers three ways to pay -- card, Stars, TON -- and all three do
 * the same thing: open `t.me/<bot>?start=subscribe_<plan>_<method>`. The
 * component says so itself, `// TODO: Integrate with payment API`.
 *
 * That payload arrives as an ordinary `/start`. The only thing in the bot
 * matching `subscribe_` is a `bot.action`, which fires on a button CALLBACK and
 * never on a start payload -- so the client who picked a plan and a payment
 * method got the ordinary greeting and the intent was gone.
 *
 * Nobody ever saw an error, which is why it lasted: from the outside it looks
 * exactly like somebody changing their mind.
 */
import { describe, it, expect } from 'vitest'
import { subscribeIntent } from '@/navigation/registerCommands'

describe('the paywall deep link is recognised', () => {
  /*
   * These are the payloads the mini app actually builds, from
   * PaywallModal.tsx: `subscribe_${planId}_${paymentMethod}` over the plans
   * junior / middle / senior and the methods robokassa / stars / ton.
   */
  it('reads the plan and the method the person chose', () => {
    expect(subscribeIntent('subscribe_middle_robokassa')).toEqual({
      plan: 'middle',
      method: 'robokassa',
    })
    expect(subscribeIntent('subscribe_senior_ton')).toEqual({
      plan: 'senior',
      method: 'ton',
    })
    expect(subscribeIntent('subscribe_junior_stars')).toEqual({
      plan: 'junior',
      method: 'stars',
    })
  })

  /*
   * The bot's own inline buttons use the bare form, and they must keep working
   * if that payload ever reaches /start.
   */
  it('accepts a plan with no method', () => {
    expect(subscribeIntent('subscribe_middle')).toEqual({
      plan: 'middle',
      method: null,
    })
  })

  it('is case-insensitive, because a link can be typed by hand', () => {
    expect(subscribeIntent('Subscribe_Middle_Stars')).toEqual({
      plan: 'middle',
      method: 'stars',
    })
  })

  /*
   * EVERY OTHER START PARAM MUST STILL GO WHERE IT WENT.
   *
   * /start already carries a referral code, the foundry link, the CRM lead
   * hand-off and the inline service cards. A greedy match here would swallow
   * one of those and break a path that works today -- which is a worse outcome
   * than the bug being fixed.
   */
  it('does not claim any other start parameter', () => {
    for (const other of [
      '144022504',
      'club',
      'foundry',
      'svc_neurophoto',
      'crm_prep_900000012',
      'subscribe',
      'subscribed_middle',
      'unsubscribe_middle',
      '',
      undefined,
    ]) {
      expect(subscribeIntent(other), `claimed ${String(other)}`).toBeNull()
    }
  })

  /*
   * A payload is attacker-controlled text: anybody can send /start with
   * anything. The plan is not used as a lookup key today, but it will be the
   * moment the plan decides a price, so it stays inside one narrow character
   * class.
   */
  it('refuses a payload carrying anything but a plain name', () => {
    for (const nasty of [
      'subscribe_middle robokassa',
      'subscribe_../../etc/passwd',
      "subscribe_middle';DROP TABLE users;--",
      'subscribe_middle_stars_extra',
      'subscribe_<script>',
    ]) {
      expect(subscribeIntent(nasty), `accepted ${nasty}`).toBeNull()
    }
  })
})
