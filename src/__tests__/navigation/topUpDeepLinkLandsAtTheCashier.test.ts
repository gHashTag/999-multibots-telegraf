/**
 * THE MINI APP CAN ONLY PAY IN STARS, AND THE OTHER TWO CASHIERS LIVE IN THE BOT.
 *
 * Owner, 2026-09-17: "add all three payment types to the mini app". The mini app
 * talks to the render; the Robokassa and CryptoBot keys are on the BOT service.
 * That is not a missing key, it is a missing route -- and copying payment
 * secrets into a second service to close it is a bigger decision than a button.
 *
 * So the button is real and the cashier is the one the bot already has: the mini
 * app opens `t.me/<bot>?start=topup_rub`, and /start puts the person in front of
 * it. The trap this repeats is the paywall's, whose three buttons opened the bot
 * with a payload nothing read -- so the parser is pinned here.
 */
import { describe, it, expect } from 'vitest'
import { topupIntent, subscribeIntent } from '@/navigation/registerCommands'

describe('the top-up deep link is recognised', () => {
  it('reads the method the person chose in the mini app', () => {
    expect(topupIntent('topup_rub')).toEqual({ method: 'rub' })
    expect(topupIntent('topup_crypto')).toEqual({ method: 'crypto' })
  })

  /*
   * The bare form is the chooser: every method the bot has, which is what the
   * in-bot "top up" button opens.
   */
  it('reads the bare form as no method chosen', () => {
    expect(topupIntent('topup')).toEqual({ method: null })
  })

  it('is case-insensitive, because a link can be typed by hand', () => {
    expect(topupIntent('Topup_Rub')).toEqual({ method: 'rub' })
  })

  /*
   * AN UNKNOWN METHOD IS STILL A TOP-UP. Sending somebody who typed
   * `topup_sber` to the greeting helps nobody: the chooser offers what exists.
   */
  it('keeps an unknown method as a top-up with no method', () => {
    expect(topupIntent('topup_sber')).toEqual({ method: null })
    expect(topupIntent('topup_stars')).toEqual({ method: null })
  })

  /*
   * EVERY OTHER START PARAMETER MUST STILL GO WHERE IT WENT. /start already
   * carries a referral code, the foundry link, the CRM lead hand-off, the
   * inline service cards and the paywall's own payload. A greedy match here
   * would break a path that works today, which is worse than the gap it fills.
   */
  it('does not claim any other start parameter', () => {
    for (const other of [
      '144022504',
      'club',
      'foundry',
      'svc_neurophoto',
      'crm-prep-900000012',
      'subscribe_middle_robokassa',
      'topups',
      'top_up',
      'topup_',
      '',
      undefined,
    ]) {
      expect(topupIntent(other), `claimed ${String(other)}`).toBeNull()
    }
  })

  it('leaves the paywall payload to the paywall parser', () => {
    expect(topupIntent('subscribe_middle_stars')).toBeNull()
    expect(subscribeIntent('topup_rub')).toBeNull()
  })

  /*
   * A start payload is attacker-typed text: anybody can send /start with
   * anything. The method decides which scene opens, so it stays inside one
   * narrow character class.
   */
  it('refuses a payload carrying anything but a plain method name', () => {
    for (const nasty of [
      'topup_rub crypto',
      'topup_../../etc/passwd',
      "topup_rub';DROP TABLE users;--",
      'topup_rub_extra',
      'topup_<script>',
    ]) {
      expect(topupIntent(nasty), `accepted ${nasty}`).toBeNull()
    }
  })
})
