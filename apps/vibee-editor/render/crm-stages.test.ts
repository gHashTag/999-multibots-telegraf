import { describe, it, expect } from 'vitest'
import { stageOf, waitingOn } from './src/agent/crm-stages'
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

/*
 * NOW is frozen above, and stageOf must be told so.
 *
 * The refusal window compares a touch's age against thirty days. Left to read
 * the wall clock, every case built with `ago()` would drift out of its window
 * as the real date moves past the fixture's NOW -- green the day it is written,
 * red a week later, for a reason that looks like a logic bug.
 */
const stageNow = (input: Parameters<typeof stageOf>[0]) =>
  stageOf({ now: NOW, ...input })

describe('money decides first', () => {
  it('a payer is a client', () => {
    expect(stageNow({ paid: true, touches: [], quietDays: 3 }).stage).toBe(
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
      stageNow({ paid: true, touches: [t('refused', 1)], quietDays: 2 }).stage
    ).toBe('client')
  })

  it('a payer who went quiet is winback, not client', () => {
    const r = stageNow({ paid: true, touches: [], quietDays: 90 })
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
    const r = stageNow({
      paid: false,
      touches: [t('note', 1), t('refused', 10)],
      quietDays: 5,
    })
    expect(r.stage).toBe('refused')
  })

  it('and even when we wrote to them again afterwards', () => {
    const r = stageNow({
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
      stageNow({ paid: false, touches: [t(kind, 1)], quietDays: 2 }).stage
    ).toBe(stage)
  })

  it('never touched, never paid is new', () => {
    expect(stageNow({ paid: false, touches: [], quietDays: 1 }).stage).toBe(
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
    const r = stageNow({ paid: false, touches: [t('bought', 1)], quietDays: 1 })
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

/*
 * THE WINDOW, AND WHY IT REPLACED AN ETERNITY.
 *
 * Until 2026-09-15 this branch read `touches.some(t => t.kind === 'refused')`:
 * ANY refusal ever, with no window. Next door, segmentOf released the same
 * person after thirty days, and the button's own text promised thirty days of
 * silence. So a person refused four hundred days ago was out of the refused
 * segment and back in the queues, while this column still called him refused.
 * Nobody argued for the eternity -- it was the absence of a window.
 */
describe('a refusal holds for thirty days, not forever', () => {
  it('still holds on the thirtieth day', () => {
    const r = stageNow({
      paid: false,
      touches: [t('refused', 30)],
      quietDays: 40,
    })
    expect(r.stage).toBe('refused')
  })

  it('lets go on the thirty-first', () => {
    const r = stageNow({
      paid: false,
      touches: [t('refused', 31)],
      quietDays: 40,
    })
    expect(r.stage).not.toBe('refused')
  })

  it('releases a four-hundred-day-old refusal, as the segment already did', () => {
    const r = stageNow({
      paid: false,
      touches: [t('refused', 400)],
      quietDays: 400,
    })
    expect(r.stage).not.toBe('refused')
  })

  it('does not read the wall clock: the same input gives the same answer', () => {
    // The guard against the defect this change introduced once: reading
    // Date.now() made every ago()-built case drift out of its window as the
    // real date moved past the fixture's NOW.
    const input = {
      paid: false,
      touches: [t('refused', 5)],
      quietDays: 6,
    }
    expect(stageOf({ ...input, now: NOW }).stage).toBe('refused')
    expect(stageOf({ ...input, now: NOW + 40 * DAY }).stage).not.toBe('refused')
  })
})

/*
 * CORRECTIONS REACH THIS FUNCTION AS AN ABSENCE.
 *
 * stageOf never learns that corrections exist: crm-touches.ts folds them away
 * before the rows get here (crm-supersede.ts). These two cases pin the contract
 * from this side, so a future caller that forgets to fold is visible as a stage
 * that disagrees with the card.
 */
describe('a cancelled refusal is simply not in the history', () => {
  it('the person returns to what the remaining facts say', () => {
    // What the fold hands over after a refusal and its undo: the refusal and
    // correction are both gone, the older reply stands.
    const r = stageNow({
      paid: false,
      touches: [t('replied', 12)],
      quietDays: 3,
    })
    expect(r.stage).toBe('talking')
  })

  it('and an unfolded history still latches, which is how a missed fold shows', () => {
    const r = stageNow({
      paid: false,
      touches: [t('refused', 10), t('replied', 12)],
      quietDays: 3,
    })
    expect(r.stage).toBe('refused')
  })
})

/**
 * A NOTE IS A FACT SOMEBODY WROTE DOWN, NOT AN ACT.
 *
 * `note` is a full TouchKind: the owner writes one from crm_touch, and since
 * 2026-09-15 the seller writes one by itself when a subscription is cancelled
 * or a managed bot is created. Reading the newest ROW blindly made a note
 * behave like the latest act, and neither function has a branch for it -- so
 * stageOf fell through to 'new' -- reason "never touched" -- about somebody with a
 * month of correspondence, and waitingOn returned null and dropped them off
 * crm_waiting entirely.
 *
 * The automatic case is the worse one: a client's subscription payment fails,
 * the system writes a note, and that is the exact moment the person vanishes
 * from the queue of people waiting on the owner.
 */
describe('a note does not pretend to be the latest act', () => {
  it('leaves the stage where the real act left it', () => {
    expect(
      stageNow({ paid: false, touches: [t('written', 2)], quietDays: 3 }).stage
    ).toBe('written')
    // The same history with a note written afterwards.
    expect(
      stageNow({
        paid: false,
        touches: [t('note', 1), t('written', 2)],
        quietDays: 3,
      }).stage
    ).toBe('written')
  })

  it('does not erase a refusal that is still holding', () => {
    expect(
      stageNow({
        paid: false,
        touches: [t('note', 0), t('refused', 5)],
        quietDays: 6,
      }).stage
    ).toBe('refused')
  })

  it('keeps the person on the waiting screen', () => {
    // Without this, a note on a client who answered took them out of `ours`
    // -- the bucket the tool itself calls the most expensive one.
    const r = waitingOn({
      paid: false,
      touches: [t('note', 0), t('replied', 1)],
      quietDays: 1,
      now: NOW,
    })
    expect(r?.waiting).toBe('ours')
  })

  it('a history of nothing but notes is still nobody touched', () => {
    expect(
      stageNow({ paid: false, touches: [t('note', 1)], quietDays: 2 }).stage
    ).toBe('new')
  })
})
