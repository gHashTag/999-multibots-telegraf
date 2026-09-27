import { describe, it, expect } from 'vitest'
import { stageOf, waitingOn, WINBACK_QUIET_DAYS } from './src/agent/crm-stages'
import { segmentOf } from './src/agent/crm-segments'
import type { TouchKind } from './src/agent/crm-touches'

/**
 * A STAGE NOBODY SET BY HAND.
 *
 * Every CRM grows a dropdown where a human picks "warm" or "in progress", and
 * three months later the funnel measures how diligent people were rather than
 * how the business is doing. Here the stage is computed from money and touches
 * every time, so these checks are about the derivation being right -- and
 * mostly about it never being rude to somebody who already said no.
 */

const DAY = 86400000
const NOW = Date.parse('2026-09-08T12:00:00Z')
const ago = (days: number) => new Date(NOW - days * DAY).toISOString()
const t = (kind: TouchKind, days: number) => ({ kind, at: ago(days) })

describe('money decides first', () => {
  it('a payer is a client', () => {
    expect(stageOf({ paid: true, touches: [], quietDays: 3 }).stage).toBe(
      'client'
    )
  })

  it('a payer who said no is STILL a client', () => {
    /*
     * They refused one offer, not the relationship. Dropping a paying customer
     * back into a selling list because of a single "no" is how a client is
     * lost, and the ledger outranks a note about a mood.
     */
    expect(
      stageOf({ paid: true, touches: [t('refused', 1)], quietDays: 2 }).stage
    ).toBe('client')
  })

  it('a payer who went quiet is winback, not client', () => {
    const r = stageOf({ paid: true, touches: [], quietDays: 90 })
    expect(r.stage).toBe('winback')
    expect(r.because).toContain('90')
  })
})

describe('a refusal is not overridden by an older touch', () => {
  it('refused stays refused even when a newer touch is weaker', () => {
    /*
     * THE ONE THAT MATTERS. Somebody says no; later somebody records a note;
     * an ordering that took only the latest touch would put them back in the
     * writing list. That is the rudeness this module exists to prevent.
     */
    const r = stageOf({
      paid: false,
      touches: [t('note', 1), t('refused', 10)],
      quietDays: 5,
    })
    expect(r.stage).toBe('refused')
  })

  it('and even when we wrote to them again afterwards', () => {
    const r = stageOf({
      paid: false,
      touches: [t('written', 1), t('refused', 30)],
      quietDays: 5,
    })
    expect(r.stage).toBe('refused')
  })
})

describe('the ordinary path', () => {
  it.each([
    ['later', 'later'],
    ['replied', 'talking'],
    ['written', 'written'],
  ] as Array<[TouchKind, string]>)('%s becomes %s', (kind, stage) => {
    expect(
      stageOf({ paid: false, touches: [t(kind, 1)], quietDays: 2 }).stage
    ).toBe(stage)
  })

  it('never touched, never paid is new', () => {
    expect(stageOf({ paid: false, touches: [], quietDays: 1 }).stage).toBe(
      'new'
    )
  })

  it('"bought" without a payment row is NOT a client', () => {
    /*
     * A note is not a receipt. Somebody typing "bought" while the ledger has
     * no completed payment is a claim, and treating it as money would put a
     * non-paying person into the client column -- where nobody sells to them
     * again and nobody notices the money never arrived.
     */
    const r = stageOf({ paid: false, touches: [t('bought', 1)], quietDays: 1 })
    expect(r.stage).toBe('written')
    expect(r.because).toContain('леджере')
  })

  it('every stage comes with the fact it rests on', () => {
    // A stage nobody can explain is a stage nobody trusts.
    for (const input of [
      { paid: true, touches: [], quietDays: 1 },
      { paid: false, touches: [t('refused', 1)], quietDays: 1 },
      { paid: false, touches: [], quietDays: 1 },
    ]) {
      expect(stageOf(input).because.length).toBeGreaterThan(3)
    }
  })
})

describe('who is waiting on whom', () => {
  const base = { noAnswerAfterDays: 3, laterAfterDays: 14, now: NOW }

  it('they answered and we did not -- immediately, with no delay', () => {
    /*
     * No grace period on this one. Every day of our silence after their reply
     * is a day they decide we are not interested, and it is the only silence
     * that costs a deal already in motion.
     */
    const r = waitingOn({
      ...base,
      paid: false,
      touches: [t('replied', 0)],
      quietDays: 1,
    })
    expect(r?.waiting).toBe('ours')
    expect(r?.days).toBe(0)
  })

  it('we wrote and nobody answered -- only after the delay', () => {
    const soon = waitingOn({
      ...base,
      paid: false,
      touches: [t('written', 1)],
      quietDays: 1,
    })
    expect(soon, 'дёргает на следующий же день').toBeNull()

    const later = waitingOn({
      ...base,
      paid: false,
      touches: [t('written', 5)],
      quietDays: 5,
    })
    expect(later?.waiting).toBe('theirs')
  })

  it('"later" comes back when later has arrived, not before', () => {
    expect(
      waitingOn({
        ...base,
        paid: false,
        touches: [t('later', 3)],
        quietDays: 3,
      })
    ).toBeNull()
    expect(
      waitingOn({
        ...base,
        paid: false,
        touches: [t('later', 20)],
        quietDays: 20,
      })?.waiting
    ).toBe('due')
  })

  it('a refusal waits for nothing', () => {
    // Nothing is owed to somebody who said no. A "waiting" list that keeps
    // resurfacing them is how the list gets ignored.
    expect(
      waitingOn({
        ...base,
        paid: false,
        touches: [t('replied', 1), t('refused', 5)],
        quietDays: 1,
      })
    ).toBeNull()
  })

  it('a client is served, not chased', () => {
    expect(
      waitingOn({
        ...base,
        paid: true,
        touches: [t('replied', 9)],
        quietDays: 1,
      })
    ).toBeNull()
  })

  it('somebody never touched is not waiting for anything', () => {
    // A waiting list that contains everybody is a list nobody opens twice.
    expect(
      waitingOn({ ...base, paid: false, touches: [], quietDays: 1 })
    ).toBeNull()
  })
})

describe('we spoke last and it went quiet (2026-09-27)', () => {
  const base = {
    paid: false,
    touches: [],
    quietDays: null,
    noAnswerAfterDays: 3,
    laterAfterDays: 14,
    now: NOW,
  }
  const w = (
    inDays: number,
    outDays: number,
    sent = 1
  ): ReturnType<typeof waitingOn> =>
    waitingOn({
      ...base,
      lastInboundAt: ago(inDays),
      lastOutboundAt: ago(outDays),
      outboundSinceInbound: sent,
    })

  it('a live talk silent for 2..14 days after our word is a follow-up', () => {
    expect(w(5, 3)?.waiting).toBe('theirs')
    expect(w(5, 3)?.days).toBe(3)
    expect(w(20, 14)?.waiting).toBe('theirs')
  })

  it('not the next morning, and not a month later -- that is winback', () => {
    expect(w(3, 1)).toBeNull()
    expect(w(40, 20)).toBeNull()
  })

  it('a word to somebody who last wrote long before is not a hanging talk', () => {
    // e.g. a delivery months after their only message
    expect(w(90, 3)).toBeNull()
  })

  it('stops after two reminders, counted from the correspondence', () => {
    expect(w(10, 3, 3)?.waiting).toBe('theirs')
    expect(w(10, 3, 4)).toBeNull()
  })

  it('they spoke last: still ours, as before', () => {
    expect(w(1, 3)?.waiting).toBe('ours')
  })
})

/*
 * THE CARD AND THE LIST AGREE ON WIN-BACK (CRM audit 2026-09-27).
 *
 * The card (stageOf) once kept a paying customer at `client` until sixty days
 * of silence, while the list (segmentOf) already flagged them `winback` after
 * a month. The same person read as two stages depending on where you looked.
 * One shared constant, WINBACK_QUIET_DAYS, now decides both, so this pins the
 * boundary and the agreement rather than a literal day count.
 */
describe('a paid quiet client is win-back on the card and the list alike', () => {
  const seg = (days: number) =>
    segmentOf({
      unanswered: false,
      next: 'wait',
      signals: [],
      daysSinceInbound: days,
      daysSinceOut: days + 1,
      lastTouch: null,
      paid: true,
      now: NOW,
    })

  it('at the threshold, both call it winback', () => {
    expect(
      stageOf({ paid: true, touches: [], quietDays: WINBACK_QUIET_DAYS }).stage
    ).toBe('winback')
    expect(seg(WINBACK_QUIET_DAYS)).toBe('winback')
  })

  it('one day short, both call it a client, not winback', () => {
    expect(
      stageOf({ paid: true, touches: [], quietDays: WINBACK_QUIET_DAYS - 1 })
        .stage
    ).toBe('client')
    expect(seg(WINBACK_QUIET_DAYS - 1)).not.toBe('winback')
  })
})
