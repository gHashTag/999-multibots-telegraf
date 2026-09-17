import { describe, it, expect } from 'vitest'
import { waitingOn, nudgesSince } from './src/agent/crm-stages'

/**
 * TWO PROMISES THE FACT MODEL COULD NOT KEEP.
 *
 * MEASURED IN PRODUCTION 2026-09-16, not imagined. `crm_touches` held five
 * rows for 2394 people and not one of them was `replied`, while
 * `crm_messages` held 25 302 inbound. Two consequences, both here:
 *
 *   1. Somebody who answered us reads as "we wrote, no answer" -- the
 *      module's own most expensive case, exactly inverted.
 *   2. The playbook's cascade ("more than two reminders without an answer --
 *      stop") had no arithmetic under it: a `written` touch does not say
 *      whether it was a first message or a fourth reminder.
 *
 * Dates here are offsets from now, computed once. A calendar date inside a
 * window is a countdown: green today, red next week (form 33).
 */
const now = Date.now()
const daysAgo = (n: number): string =>
  new Date(now - n * 86400_000).toISOString()

const base = {
  paid: false,
  quietDays: null,
  noAnswerAfterDays: 3,
  laterAfterDays: 14,
  now,
}

describe('an answer nobody wrote down is still an answer', () => {
  it('a newer inbound message makes it OURS, not theirs', () => {
    const w = waitingOn({
      ...base,
      touches: [{ kind: 'written', at: daysAgo(6) }],
      lastInboundAt: daysAgo(2),
    })
    expect(w?.waiting).toBe('ours')
    expect(w?.days).toBe(2)
  })

  it('an OLDER inbound message leaves the answer alone', () => {
    // They wrote, then we wrote after them: the silence really is theirs.
    const w = waitingOn({
      ...base,
      touches: [{ kind: 'written', at: daysAgo(4) }],
      lastInboundAt: daysAgo(9),
    })
    expect(w?.waiting).toBe('theirs')
  })

  it('without messages at all, nothing changes for that owner', () => {
    // An owner who has not connected Telegram has no inbound to offer, and
    // the touch-only answer is still the best one available.
    const w = waitingOn({
      ...base,
      touches: [{ kind: 'written', at: daysAgo(4) }],
    })
    expect(w?.waiting).toBe('theirs')
    expect(w?.days).toBe(4)
  })

  it('a garbage timestamp is ignored rather than believed', () => {
    const w = waitingOn({
      ...base,
      touches: [{ kind: 'written', at: daysAgo(4) }],
      lastInboundAt: 'yesterday, probably',
    })
    expect(w?.waiting).toBe('theirs')
  })
})

describe('reminders are counted, so the cascade can stop', () => {
  it('counts the writes that came after their last word', () => {
    expect(
      nudgesSince({
        touches: [
          { kind: 'written', at: daysAgo(1) },
          { kind: 'written', at: daysAgo(4) },
          { kind: 'replied', at: daysAgo(9) },
          { kind: 'written', at: daysAgo(12) },
        ],
      })
    ).toBe(2)
  })

  it('an inbound message resets the run exactly like a replied touch', () => {
    expect(
      nudgesSince({
        touches: [
          { kind: 'written', at: daysAgo(1) },
          { kind: 'written', at: daysAgo(4) },
          { kind: 'written', at: daysAgo(12) },
        ],
        lastInboundAt: daysAgo(6),
      })
    ).toBe(2)
  })

  it('two unanswered reminders still wait', () => {
    const w = waitingOn({
      ...base,
      touches: [
        { kind: 'written', at: daysAgo(5) },
        { kind: 'written', at: daysAgo(9) },
      ],
    })
    expect(w?.waiting).toBe('theirs')
  })

  it('a third stops the chase: nobody is waiting any more', () => {
    const w = waitingOn({
      ...base,
      touches: [
        { kind: 'written', at: daysAgo(4) },
        { kind: 'written', at: daysAgo(9) },
        { kind: 'written', at: daysAgo(14) },
      ],
    })
    expect(w).toBeNull()
  })

  it('the cap is a number the caller can change', () => {
    const touches = [
      { kind: 'written' as const, at: daysAgo(4) },
      { kind: 'written' as const, at: daysAgo(9) },
      { kind: 'written' as const, at: daysAgo(14) },
    ]
    expect(waitingOn({ ...base, touches, maxNudges: 5 })?.waiting).toBe(
      'theirs'
    )
    expect(waitingOn({ ...base, touches, maxNudges: 1 })).toBeNull()
  })

  it('a refusal ends the run before the cap is even asked', () => {
    // Refused already parks the person; the count must not look past it and
    // mistake older sends for fresh reminders.
    expect(
      nudgesSince({
        touches: [
          { kind: 'written', at: daysAgo(2) },
          { kind: 'refused', at: daysAgo(5) },
          { kind: 'written', at: daysAgo(8) },
          { kind: 'written', at: daysAgo(11) },
        ],
      })
    ).toBe(1)
  })

  it('a word of theirs with an unreadable date still ends the run', () => {
    /*
     * The timestamp comparison does most of this work, and a bad row is where
     * it stops working: an unparseable date gives no moment to compare
     * against. Proven by mutation -- turning the break into a continue here
     * counts the sends from BEFORE they answered as fresh reminders, and
     * somebody who already replied gets chased out of the queue.
     */
    expect(
      nudgesSince({
        touches: [
          { kind: 'written', at: daysAgo(2) },
          { kind: 'replied', at: 'not a date at all' },
          { kind: 'written', at: daysAgo(8) },
        ],
      })
    ).toBe(1)
  })

  it('a note of ours is not a reminder and does not break the run', () => {
    expect(
      nudgesSince({
        touches: [
          { kind: 'written', at: daysAgo(2) },
          { kind: 'note', at: daysAgo(3) },
          { kind: 'written', at: daysAgo(6) },
          { kind: 'written', at: daysAgo(10) },
        ],
      })
    ).toBe(3)
  })
})

describe('a conversation nobody recorded a touch for', () => {
  it('their word with nothing back is OURS, with no touch at all', () => {
    const w = waitingOn({ ...base, touches: [], lastInboundAt: daysAgo(5) })
    expect(w?.waiting).toBe('ours')
    expect(w?.days).toBe(5)
  })

  it('we answered after them, so nobody is waiting', () => {
    const w = waitingOn({
      ...base,
      touches: [],
      lastInboundAt: daysAgo(5),
      lastOutboundAt: daysAgo(4),
    })
    expect(w).toBeNull()
  })

  it('an outbound at the same moment does not count as owing them', () => {
    const at = daysAgo(5)
    expect(
      waitingOn({ ...base, touches: [], lastInboundAt: at, lastOutboundAt: at })
    ).toBeNull()
  })

  it('our messages alone never make THEM the ones who owe an answer', () => {
    // An outbound message is the bot doing its job -- a finished picture, a
    // receipt. Reading it as chasing would put people in the queue whom
    // nobody has pestered.
    const w = waitingOn({ ...base, touches: [], lastOutboundAt: daysAgo(30) })
    expect(w).toBeNull()
  })

  it('no facts at all is still nothing, not a guess', () => {
    expect(waitingOn({ ...base, touches: [] })).toBeNull()
  })

  it('a client who paid is served, not chased, even with an open inbound', () => {
    const w = waitingOn({
      ...base,
      paid: true,
      touches: [],
      lastInboundAt: daysAgo(2),
    })
    expect(w).toBeNull()
  })
})
