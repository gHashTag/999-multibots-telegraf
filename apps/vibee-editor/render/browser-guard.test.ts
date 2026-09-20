import { describe, it, expect } from 'vitest'
import {
  isSensitive,
  mayAct,
  sensitiveList,
  PERMISSION_WINDOW_MS,
} from './src/browser/guard'

/**
 * THE GUARD AN AGENT CANNOT DRIVE PAST.
 *
 * It is about PLACE, not action, and that choice is the whole design: a
 * click is a point on a screen, and nothing outside the page knows whether
 * it says "Next" or "Send £4,000". Where we are is knowable.
 */

const NOW = 1_800_000_000_000
const list = sensitiveList({})

describe('where an agent may not act alone', () => {
  it('stops at the money', () => {
    expect(isSensitive('https://www.paypal.com/myaccount', list)).toBe(true)
    expect(isSensitive('https://checkout.stripe.com/pay/x', list)).toBe(true)
    expect(isSensitive('https://online.sberbank.ru/', list)).toBe(true)
  })

  it('stops where a click reaches other people', () => {
    expect(isSensitive('https://mail.google.com/mail/u/0', list)).toBe(true)
    expect(isSensitive('https://web.telegram.org/a/', list)).toBe(true)
  })

  it('knows a corner of a site, not only the site', () => {
    /* yandex.ru is a search engine; yandex.ru/mail is somebody's inbox. */
    expect(isSensitive('https://yandex.ru/search/?text=cats', list)).toBe(false)
    expect(isSensitive('https://yandex.ru/mail/inbox', list)).toBe(true)
  })

  it('leaves the ordinary web alone, which is most of it', () => {
    expect(isSensitive('https://ru.wikipedia.org/wiki/Linux', list)).toBe(false)
    expect(isSensitive('https://news.ycombinator.com/', list)).toBe(false)
  })

  it('does not treat the browser own pages as anybody bank', () => {
    expect(isSensitive('about:blank', list)).toBe(false)
    expect(isSensitive('chrome://newtab/', list)).toBe(false)
  })

  it('TREATS AN ADDRESS IT CANNOT READ AS SENSITIVE', () => {
    /*
     * "We do not know where we are" must never be the answer that lets an
     * agent act. The cautious side is the only honest default here.
     */
    expect(isSensitive('not a url at all', list)).toBe(true)
    expect(isSensitive('', list)).toBe(true)
  })

  it('takes additions the person made themselves', () => {
    const mine = sensitiveList({
      BROWSER_SENSITIVE_DOMAINS: 'myclinic.example',
    })
    expect(isSensitive('https://myclinic.example/records', mine)).toBe(true)
    expect(isSensitive('https://myclinic.example/records', list)).toBe(false)
  })
})

describe('one yes, and how long it lasts', () => {
  it('refuses on a sensitive page with no permission', () => {
    const v = mayAct(
      { url: 'https://mail.google.com/', allowedAtMs: null, nowMs: NOW },
      list
    )
    expect(v.allowed).toBe(false)
    if (v.allowed) throw new Error('expected a refusal')
    expect(v.where).toBe('mail.google.com')
  })

  it('allows with a fresh yes', () => {
    expect(
      mayAct(
        {
          url: 'https://mail.google.com/',
          allowedAtMs: NOW - 60_000,
          nowMs: NOW,
        },
        list
      ).allowed
    ).toBe(true)
  })

  it('keeps the window measured in MINUTES, not hours', () => {
    /*
     * The staleness test below takes its duration from the constant, so it
     * grows with it -- a mutation widening the window to a day survived it.
     * This is the absolute the other one cannot express.
     */
    expect(PERMISSION_WINDOW_MS).toBeLessThanOrEqual(15 * 60 * 1000)
    expect(PERMISSION_WINDOW_MS).toBeGreaterThanOrEqual(60 * 1000)
  })

  it('a yes from half an hour ago is not a yes', () => {
    /* Absolute, so widening the constant cannot quietly make it pass. */
    expect(
      mayAct(
        {
          url: 'https://mail.google.com/',
          allowedAtMs: NOW - 30 * 60 * 1000,
          nowMs: NOW,
        },
        list
      ).allowed
    ).toBe(false)
  })

  it('A YES GOES STALE', () => {
    /* Otherwise one permission opens the door for the rest of the session. */
    expect(
      mayAct(
        {
          url: 'https://mail.google.com/',
          allowedAtMs: NOW - PERMISSION_WINDOW_MS - 1,
          nowMs: NOW,
        },
        list
      ).allowed
    ).toBe(false)
  })

  it('never asks anything on an ordinary page', () => {
    expect(
      mayAct(
        { url: 'https://ru.wikipedia.org/', allowedAtMs: null, nowMs: NOW },
        list
      ).allowed
    ).toBe(true)
  })
})

describe('the tools that act are the ones that are gated', () => {
  it('reading is never gated, acting always is', async () => {
    const { BROWSER_TOOLS } = await import('./src/browser/agent-tools')
    const fs = await import('node:fs')
    const src = fs.readFileSync('src/browser/agent-tools.ts', 'utf8')

    /*
     * Each tool's body runs to the NEXT tool, not for a fixed number of
     * characters -- a window that spills into the neighbour reported
     * browser_screenshot as gated because browser_click, right after it, is.
     */
    const bodyOf = (name: string) => {
      const from = src.indexOf(`name: '${name}'`)
      expect(from, name).toBeGreaterThan(-1)
      const next = src.indexOf("name: 'browser_", from + 10)
      return src.slice(from, next === -1 ? undefined : next)
    }

    /*
     * A person watching an agent read their inbox is fine; a person watching
     * it click "Send" is not, and that is the whole distinction.
     */
    for (const name of ['browser_click', 'browser_type', 'browser_evaluate']) {
      expect(bodyOf(name), name).toContain('mustBeAllowedToAct')
    }
    for (const name of [
      'browser_read',
      'browser_screenshot',
      'browser_status',
    ]) {
      expect(bodyOf(name), name).not.toContain('mustBeAllowedToAct')
    }
    expect(BROWSER_TOOLS.length).toBeGreaterThan(6)
  })
})
