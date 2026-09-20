/**
 * EVERY BOT ERROR REACHES THE JOURNAL, AND A STORM DOES NOT BURY IT.
 *
 * Owner, 2026-09-20: the bots' errors must reach the board with the highest
 * priority. The trap is not getting them there -- it is what a bad hour looks
 * like once they arrive. One broken dependency in a shared handler fails on
 * every update; at one line per error the journal becomes a wall, and the one
 * unrelated failure that mattered is the line nobody scrolls to.
 *
 * So what is pinned here is the roll-up: repeats are counted under one name,
 * the worst few are named, the rest are a number, the line fits, and a window
 * with nothing in it says nothing at all.
 */
import { describe, it, expect } from 'vitest'
import {
  ErrorCollector,
  WINDOW_MS,
  MAX_SIGNATURES,
} from '@/services/hiveErrors'

/** A distinct name per index, made of letters the fingerprint keeps. */
function name(i: number): string {
  const a = 'abcdefghijklmnopqrstuvwxyz'
  return a[i % 26] + a[Math.floor(i / 26) % 26] + a[Math.floor(i / 676) % 26]
}

describe('the window of bot errors', () => {
  it('says nothing when nothing broke', () => {
    const c = new ErrorCollector()
    expect(c.due(WINDOW_MS * 10)).toBe(false)
    expect(c.drain()).toBeNull()
  })

  /*
   * THE NUMBER IS THE POINT. The Telegram push deliberately suppresses
   * repeats -- one incident, one push -- and that is exactly the fact an
   * outage is made of: "this failed four thousand times" is the most useful
   * thing anybody can be told about it.
   */
  it('counts every repeat, it does not suppress them', () => {
    const c = new ErrorCollector()
    for (let i = 0; i < 4000; i++) c.add('[fal] connect ECONNREFUSED', 'fal', 0)
    const r = c.drain()
    expect(r?.total).toBe(4000)
    expect(r?.kinds).toBe(1)
    expect(r?.what).toContain('4000')
  })

  /*
   * One defect must be one name whatever number it carries: the signature is
   * the alert throttle's fingerprint, so a retry counter or a row id in the
   * text does not turn one failure into a hundred.
   */
  it('treats one defect as one kind however many ids it carries', () => {
    const c = new ErrorCollector()
    for (let i = 0; i < 50; i++) c.add(`[db] row ${i} not found`, 'db', 0)
    const r = c.drain()
    expect(r?.kinds).toBe(1)
    expect(r?.total).toBe(50)
  })

  it('names the worst few and counts the rest', () => {
    const c = new ErrorCollector()
    for (let i = 0; i < 9; i++) c.add('[a] provider is down', 'a', 0)
    for (let i = 0; i < 5; i++) c.add('[b] cannot read config', 'b', 0)
    c.add('[c] unexpected token', 'c', 0)
    c.add('[d] timed out', 'd', 0)
    c.add('[e] broken pipe', 'e', 0)
    const r = c.drain()
    expect(r?.total).toBe(17)
    expect(r?.kinds).toBe(5)
    expect(r?.what).toContain('provider is down')
    expect(r?.what).toContain('×9')
    // The two that were not named are a number, not a silence.
    expect(r?.what).toMatch(/\+2/)
  })

  /*
   * THE JOURNAL CUTS AT 200, THOUGH THE ROUTE ADMITS 300. `record` slices
   * again before the INSERT, so 200 is what survives -- and the tail of this
   * line is the "+N", the part that says something was left out, which is
   * exactly what a cut eats first.
   */
  it('fits the line the journal will store', () => {
    const c = new ErrorCollector()
    for (let i = 0; i < 40; i++) {
      c.add(`[svc-${i}] ` + 'a very long failure message '.repeat(4), 's', 0)
    }
    const r = c.drain()
    expect(r!.what.length).toBeLessThanOrEqual(200)
  })

  /*
   * A STORM INVENTS NAMES FASTER THAN A WINDOW CLOSES. The count must survive
   * the cap even though the names cannot: losing the total is losing the only
   * number that says how bad it was.
   */
  it('keeps counting after it stops keeping names', () => {
    const c = new ErrorCollector()
    const many = MAX_SIGNATURES + 500
    /*
     * Distinct by LETTERS, not by numbers. The fingerprint collapses digits on
     * purpose -- a retry counter must not make every repetition unique -- so a
     * fixture numbered 1..700 is 700 messages of a handful of kinds, and it
     * would never reach the cap it claims to test. (It did not, the first time
     * this was written.)
     */
    for (let i = 0; i < many; i++) {
      c.add(`[x] failure of kind ${name(i)}`, undefined, 0)
    }
    const r = c.drain()
    expect(r?.total).toBe(many)
    expect(r!.kinds).toBeGreaterThanOrEqual(MAX_SIGNATURES)
  })

  it('holds the window open until it is due, then starts a fresh one', () => {
    const c = new ErrorCollector()
    c.add('[a] boom', 'a', 1000)
    expect(c.due(1000 + WINDOW_MS - 1)).toBe(false)
    expect(c.due(1000 + WINDOW_MS)).toBe(true)
    expect(c.drain()?.total).toBe(1)
    // Drained: the next window has not started, so nothing is due.
    expect(c.due(1000 + WINDOW_MS * 5)).toBe(false)
    expect(c.drain()).toBeNull()
  })
})
