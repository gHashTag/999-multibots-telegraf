import { describe, it, expect } from 'vitest'
import { sawAtErrors } from './src/browser/saw'
import type { JournalRow } from './src/browser/journal'

/**
 * WHAT THE AGENT SAW WHEN IT ERRED.
 *
 * The 2026-09-22 story, made into a test: the agent looked at a Google
 * sign-in, then a click failed. The focused view must pair the failure with
 * that look -- not with a later screenshot, not with nothing.
 *
 * Rows are newest first, the order readJournal returns.
 */

const row = (
  at: string,
  tool: string,
  ok: boolean,
  detail: Record<string, unknown> = {}
): JournalRow => ({ at, tool, ok, ms: 10, detail })

describe('sawAtErrors', () => {
  it('PAIRS AN ERROR WITH THE LAST LOOK BEFORE IT -- the 2026-09-22 shape', () => {
    // Newest first: the click failed AFTER the agent read the sign-in page.
    const rows = [
      row('2026-09-22T20:00:05Z', 'browser_click', false, {
        error: 'no element at 740,394',
        x: 740,
        y: 394,
      }),
      row('2026-09-22T20:00:03Z', 'browser_read', true, {
        url: 'https://accounts.google.com/signin',
        title: 'Sign in - Google Accounts',
      }),
    ]
    const moments = sawAtErrors(rows)
    expect(moments).toHaveLength(1)
    expect(moments[0].tool).toBe('browser_click')
    expect(moments[0].error).toBe('no element at 740,394')
    expect(moments[0].saw).toEqual({
      tool: 'browser_read',
      at: '2026-09-22T20:00:03Z',
      agoMs: 2000,
      url: 'https://accounts.google.com/signin',
      title: 'Sign in - Google Accounts',
    })
  })

  it('reads a screenshot as a look, by its `seen` line', () => {
    const rows = [
      row('2026-09-22T20:01:00Z', 'browser_evaluate', false, {
        error: 'Runtime.evaluate timed out',
      }),
      row('2026-09-22T20:00:58Z', 'browser_screenshot', true, {
        seen: 'a blank white page',
      }),
    ]
    const [m] = sawAtErrors(rows)
    expect(m.saw).toMatchObject({
      tool: 'browser_screenshot',
      seen: 'a blank white page',
    })
  })

  it('LEAVES saw NULL when nothing was looked at before the error', () => {
    const rows = [
      row('2026-09-22T20:02:00Z', 'browser_open', false, { error: 'net::ERR' }),
    ]
    const [m] = sawAtErrors(rows)
    /* Nothing looked at is not the same fact as looked-and-saw-nothing. */
    expect(m.saw).toBeNull()
  })

  it('never counts an action (click/type) as a look', () => {
    const rows = [
      row('2026-09-22T20:03:03Z', 'browser_evaluate', false, { error: 'x' }),
      row('2026-09-22T20:03:02Z', 'browser_click', true, { x: 1, y: 2 }),
      row('2026-09-22T20:03:01Z', 'browser_type', true, { chars: 4 }),
    ]
    const [m] = sawAtErrors(rows)
    expect(m.saw).toBeNull()
  })

  it('does not count a read that itself came back empty', () => {
    const rows = [
      row('2026-09-22T20:04:02Z', 'browser_click', false, { error: 'x' }),
      // A read that failed to see anything: no url, no title.
      row('2026-09-22T20:04:01Z', 'browser_read', false, { error: 'nav' }),
    ]
    const [m] = sawAtErrors(rows)
    expect(m.saw).toBeNull()
  })

  it('reports every error in order, each with its own look', () => {
    const rows = [
      row('2026-09-22T20:05:06Z', 'browser_click', false, { error: 'b' }),
      row('2026-09-22T20:05:05Z', 'browser_read', true, {
        url: 'https://x.com/home',
        title: 'X',
      }),
      row('2026-09-22T20:05:04Z', 'browser_type', false, { error: 'a' }),
      row('2026-09-22T20:05:03Z', 'browser_screenshot', true, {
        seen: 'the feed',
      }),
    ]
    const moments = sawAtErrors(rows)
    expect(moments.map(m => m.tool)).toEqual(['browser_click', 'browser_type'])
    expect(moments[0].saw?.url).toBe('https://x.com/home')
    expect(moments[1].saw?.seen).toBe('the feed')
  })

  it('an out-of-order clock never yields a negative ago', () => {
    // Defensive: if two rows share or cross a millisecond, ago floors at 0.
    const rows = [
      row('2026-09-22T20:06:00Z', 'browser_click', false, { error: 'x' }),
      row('2026-09-22T20:06:00Z', 'browser_read', true, {
        title: 'same instant',
      }),
    ]
    const [m] = sawAtErrors(rows)
    expect(m.saw?.agoMs).toBe(0)
  })
})
