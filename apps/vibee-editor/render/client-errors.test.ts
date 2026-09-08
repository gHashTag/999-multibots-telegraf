import { describe, it, expect } from 'vitest'
import {
  ClientErrorGate,
  formatClientErrorAlert,
  parseClientError,
} from './src/client-errors'

/**
 * The browser's failure reaches the owner once, safely.
 *
 * 08.09.2026: "Network unavailable: TypeError: Load failed" was seen by the
 * owner as a customer and by nobody as an alert -- the request that failed
 * never reached the server. The intake below is the one place such reports
 * land; these pins keep it honest: a storm collapses to one message per
 * ten minutes per error, twenty an hour at most, and browser text is never
 * pasted into Telegram HTML unescaped.
 */
const report = (over: Partial<Record<string, unknown>> = {}) =>
  parseClientError({
    kind: 'agent_stream_failed',
    message: 'TypeError: Load failed',
    context: 'attempts=2 elapsedMs=31200 tool=templates_list',
    path: '/chat',
    ua: 'Telegram iOS',
    build: 'fda6f85ac',
    ts: 1_757_350_000_000,
    ...over,
  })

describe('parseClientError', () => {
  it('requires kind and message, clips every field, sanitises kind', () => {
    expect(() => parseClientError(null)).toThrow()
    expect(() => parseClientError({ kind: 'x' })).toThrow()
    const r = parseClientError({
      kind: 'agent <script>',
      message: 'a'.repeat(1000),
      context: 'c'.repeat(1000),
      ts: 'nope',
    })
    expect(r.kind).toBe('agentscript')
    expect(r.message).toHaveLength(400)
    expect(r.context).toHaveLength(600)
    expect(r.ts).toBe(0)
  })
})

describe('ClientErrorGate', () => {
  it('lets the first report through, dedups the same one for ten minutes, then again', () => {
    const g = new ClientErrorGate()
    const t0 = 1_000_000
    expect(g.decide(report(), t0)).toBe('notify')
    expect(g.decide(report(), t0 + 5 * 60_000)).toBe('dedup')
    expect(g.decide(report({ message: 'other' }), t0 + 6 * 60_000)).toBe(
      'notify'
    )
    expect(g.decide(report(), t0 + 11 * 60_000)).toBe('notify')
  })

  it('caps at twenty alerts an hour and recovers after the hour', () => {
    const g = new ClientErrorGate(0, 20)
    const t0 = 5_000_000
    for (let i = 0; i < 20; i++)
      expect(g.decide(report({ message: `e${i}` }), t0 + i)).toBe('notify')
    expect(g.decide(report({ message: 'e21' }), t0 + 21)).toBe('capped')
    expect(g.decide(report({ message: 'e22' }), t0 + 3_600_001 + 21)).toBe(
      'notify'
    )
  })
})

describe('formatClientErrorAlert', () => {
  it('escapes browser text and names who and when', () => {
    const text = formatClientErrorAlert(
      report({ message: 'TypeError: <Load> & failed' }),
      '144022504'
    )
    expect(text).toContain('&lt;Load&gt; &amp; failed')
    expect(text).not.toContain('<Load>')
    expect(text).toContain('tg://user?id=144022504')
    expect(text).toContain('agent_stream_failed')
    expect(text).toContain('/chat')
    expect(text).toContain('2025-09-08')
  })

  it('an unsigned (web) report says so instead of inventing a person', () => {
    expect(formatClientErrorAlert(report(), null)).toContain('не подписан')
  })
})
