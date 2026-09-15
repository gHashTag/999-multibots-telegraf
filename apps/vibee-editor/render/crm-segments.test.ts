import { describe, it, expect } from 'vitest'
import {
  segmentOf,
  countSegments,
  segmentCaps,
  SEGMENTS,
  SEGMENT_CAPS_DEFAULT,
} from './src/agent/crm-segments'

/** One person, one segment, by precedence; the counts add up. */
const NOW = Date.parse('2026-09-09T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW - n * 86400_000).toISOString()
const base = {
  unanswered: false,
  next: 'wait',
  signals: [] as string[],
  daysSinceInbound: 20,
  daysSinceOut: 21,
  lastTouch: null as { kind: string; at: string } | null,
  paid: false,
  now: NOW,
}

describe('segmentOf', () => {
  it('a person who is hot AND unanswered counts once, as hot', () => {
    expect(
      segmentOf({
        ...base,
        unanswered: true,
        next: 'reply',
        signals: ['price'],
        daysSinceInbound: 1,
      })
    ).toBe('hot')
    expect(segmentOf({ ...base, next: 'deliver' })).toBe('hot')
  })

  /*
   * THE BOUNDARY, WHICH NOTHING GUARDED.
   *
   * Removing the `days <= 7` window from the price-ask rule broke no test: the
   * only case that reached it asked one day ago, which is hot either way. The
   * window is the whole difference between "he is asking about price right now"
   * and "he asked once, a while back" -- and it is what a queue is built from.
   *
   * Found while repairing crm-memory-tools.test.ts, which had rotted past this
   * very boundary: its fixture aged from one day to eight and started failing
   * for a reason that looked like broken precedence.
   */
  it('a price ask goes cold after a week', () => {
    const asking = {
      ...base,
      signals: ['price'],
      unanswered: false,
      next: 'wait',
    }
    expect(segmentOf({ ...asking, daysSinceInbound: 7 })).toBe('hot')
    expect(segmentOf({ ...asking, daysSinceInbound: 8 })).not.toBe('hot')
  })
  it('an objection this week outranks waiting; an old objection does not', () => {
    expect(
      segmentOf({
        ...base,
        unanswered: true,
        next: 'reply',
        signals: ['objection'],
        daysSinceInbound: 3,
      })
    ).toBe('objection')
    expect(
      segmentOf({
        ...base,
        unanswered: true,
        next: 'reply',
        signals: ['objection'],
        daysSinceInbound: 12,
      })
    ).toBe('waiting')
  })
  it('unanswered is waiting, never warm or winback', () => {
    expect(
      segmentOf({
        ...base,
        unanswered: true,
        next: 'reply',
        daysSinceInbound: 40,
      })
    ).toBe('waiting')
    expect(
      segmentOf({
        ...base,
        unanswered: true,
        next: 'reply',
        paid: true,
        daysSinceInbound: 40,
      })
    ).toBe('waiting')
  })
  it('talk follows the next step', () => {
    expect(
      segmentOf({ ...base, next: 'talk', daysSinceInbound: 5, daysSinceOut: 3 })
    ).toBe('talk')
  })
  it('due: asked for later two weeks ago; not when refused lately or a client', () => {
    expect(
      segmentOf({ ...base, lastTouch: { kind: 'later', at: daysAgo(15) } })
    ).toBe('due')
    expect(
      segmentOf({ ...base, lastTouch: { kind: 'later', at: daysAgo(5) } })
    ).toBe('quiet')
    expect(
      segmentOf({
        ...base,
        paid: true,
        lastTouch: { kind: 'later', at: daysAgo(15) },
      })
    ).not.toBe('due')
  })
  it('ours: they answered our touch and we have not written since', () => {
    expect(
      segmentOf({
        ...base,
        lastTouch: { kind: 'replied', at: daysAgo(2) },
        daysSinceOut: 5,
      })
    ).toBe('ours')
    expect(
      segmentOf({
        ...base,
        lastTouch: { kind: 'replied', at: daysAgo(2) },
        daysSinceOut: 1,
      })
    ).not.toBe('ours')
  })
  it('warm: quiet two to eight weeks, no refusal, never paid, we wrote a week ago or more', () => {
    expect(segmentOf({ ...base, daysSinceInbound: 20, daysSinceOut: 21 })).toBe(
      'warm'
    )
    expect(segmentOf({ ...base, daysSinceInbound: 20, daysSinceOut: 2 })).toBe(
      'quiet'
    )
    expect(segmentOf({ ...base, daysSinceInbound: 61 })).toBe('quiet')
    expect(
      segmentOf({
        ...base,
        daysSinceInbound: 20,
        lastTouch: { kind: 'refused', at: daysAgo(10) },
      })
    ).toBe('quiet')
    expect(
      segmentOf({
        ...base,
        daysSinceInbound: 20,
        lastTouch: { kind: 'refused', at: daysAgo(40) },
      })
    ).toBe('warm')
  })
  it('a paid silent client is winback, not warm; a refused client is quiet', () => {
    expect(segmentOf({ ...base, paid: true, daysSinceInbound: 45 })).toBe(
      'winback'
    )
    expect(
      segmentOf({
        ...base,
        paid: true,
        daysSinceInbound: 45,
        lastTouch: { kind: 'refused', at: daysAgo(3) },
      })
    ).toBe('quiet')
    expect(segmentOf({ ...base, paid: true, daysSinceInbound: 10 })).toBe(
      'quiet'
    )
  })
  it('the counts add up to the list length', () => {
    const list = Array.from({ length: 40 }, (_, i) => ({
      segment: segmentOf({
        ...base,
        unanswered: i % 5 === 0,
        next: i % 5 === 0 ? 'reply' : i % 7 === 0 ? 'talk' : 'wait',
        signals: i % 11 === 0 ? ['price'] : i % 13 === 0 ? ['objection'] : [],
        daysSinceInbound: (i * 3) % 70,
        daysSinceOut: (i * 5) % 30,
        paid: i % 9 === 0,
        lastTouch: i % 17 === 0 ? { kind: 'later', at: daysAgo(20) } : null,
      }),
    }))
    const counts = countSegments(list)
    expect(SEGMENTS.reduce((n, s) => n + counts[s], 0)).toBe(40)
  })
  it('caps come from the environment and fall back on garbage', () => {
    expect(segmentCaps({})).toEqual({ ...SEGMENT_CAPS_DEFAULT, day: 30 })
    expect(
      segmentCaps({
        SELLER_SEGMENT_CAPS: 'hot=4, waiting=50, nope=9, talk=x',
        SELLER_DAILY_CAP: '12',
      })
    ).toEqual({
      ...SEGMENT_CAPS_DEFAULT,
      hot: 4,
      waiting: 50,
      day: 12,
    })
    expect(segmentCaps({ SELLER_DAILY_CAP: 'many' }).day).toBe(30)
  })
})
