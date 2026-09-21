import { describe, it, expect, vi, beforeEach } from 'vitest'
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

/*
 * WHY THIS DRIVES THE TOOLS INSTEAD OF READING THEIR SOURCE.
 *
 * The first version of this test opened `agent-tools.ts` and looked for the
 * word `mustBeAllowedToAct` inside each tool's body. It passed for two bad
 * reasons: it would have kept passing if the helper were called and its
 * verdict thrown away, and it read the file by a RELATIVE path, so it failed
 * the moment it ran from the repository root instead of the package -- which
 * is exactly how the pre-push guard runs it.
 *
 * So: a fake browser, a real session, and the actual handlers. What is
 * asserted is what matters -- on a sensitive page with no permission, the
 * click never reaches the browser.
 */

const cdpCalls: string[] = []

vi.mock('./src/browser/cdp', () => ({
  frontPage: async () => ({ id: 'page-1', url: PAGE.url }),
  listTargets: async () => [{ id: 'page-1', url: PAGE.url, type: 'page' }],
  newPage: async () => ({ id: 'page-1', url: PAGE.url }),
  closePage: async () => {
    cdpCalls.push('closePage')
  },
  evaluateOn: async () => {
    cdpCalls.push('evaluateOn')
    return { title: 'x', url: PAGE.url, text: 'x' }
  },
  clickAt: async () => {
    cdpCalls.push('clickAt')
  },
  typeText: async () => {
    cdpCalls.push('typeText')
  },
  screenshot: async () => {
    cdpCalls.push('screenshot')
    return 'AAAA'
  },
}))

/* The page the fake browser is sitting on; each test sets it. */
const PAGE = { url: 'https://ru.wikipedia.org/wiki/x' }

function ctxWith(allowedMsAgo: number | null) {
  return {
    telegramId: '900000001',
    requestId: 'r1',
    pool: {
      query: async () => ({
        rows: [
          {
            telegram_id: '900000001',
            session_id: 's1',
            pod_id: 'pod',
            endpoint: '127.0.0.1:1',
            cdp_endpoint: '127.0.0.1:2',
            allowed_ms:
              allowedMsAgo === null ? null : Date.now() - allowedMsAgo,
            state: 'live',
            view_token: 'v',
            admin_token: 'a',
          },
        ],
      }),
    },
  } as never
}

const ACTING = ['browser_click', 'browser_type', 'browser_evaluate']
const READING = ['browser_read', 'browser_screenshot']

const argsFor: Record<string, Record<string, unknown>> = {
  browser_click: { x: 10, y: 10 },
  browser_type: { text: 'hello' },
  browser_evaluate: { expression: '1+1' },
  browser_read: {},
  browser_screenshot: {},
}

describe('the tools that act are the ones that are gated', () => {
  beforeEach(() => {
    cdpCalls.length = 0
  })

  it('REFUSES TO ACT on a sensitive page with no permission', async () => {
    PAGE.url = 'https://mail.google.com/mail/u/0'
    const { BROWSER_TOOLS } = await import('./src/browser/agent-tools')

    for (const name of ACTING) {
      const tool = BROWSER_TOOLS.find(t => t.name === name)
      expect(tool, name).toBeTruthy()
      await expect(
        tool!.handler(argsFor[name], ctxWith(null)),
        name
      ).rejects.toThrow(/permission/i)
    }

    /*
     * The point of the whole guard: not that it threw, but that nothing
     * happened in the browser. A refusal after the click is not a refusal.
     */
    expect(cdpCalls).toEqual([])
  })

  it('lets it READ the very same page', async () => {
    PAGE.url = 'https://mail.google.com/mail/u/0'
    const { BROWSER_TOOLS } = await import('./src/browser/agent-tools')

    for (const name of READING) {
      const tool = BROWSER_TOOLS.find(t => t.name === name)
      await expect(
        tool!.handler(argsFor[name], ctxWith(null))
      ).resolves.toBeTruthy()
    }
    expect(cdpCalls).toEqual(['evaluateOn', 'screenshot'])
  })

  it('acts once the person has said yes, and the click LANDS', async () => {
    PAGE.url = 'https://mail.google.com/mail/u/0'
    const { BROWSER_TOOLS } = await import('./src/browser/agent-tools')
    const click = BROWSER_TOOLS.find(t => t.name === 'browser_click')!

    await expect(
      click.handler({ x: 1, y: 2 }, ctxWith(60_000))
    ).resolves.toBeTruthy()
    expect(cdpCalls).toContain('clickAt')
  })

  it('a yes from an hour ago does not still open the door', async () => {
    PAGE.url = 'https://mail.google.com/mail/u/0'
    const { BROWSER_TOOLS } = await import('./src/browser/agent-tools')
    const click = BROWSER_TOOLS.find(t => t.name === 'browser_click')!

    await expect(
      click.handler({ x: 1, y: 2 }, ctxWith(60 * 60_000))
    ).rejects.toThrow(/permission/i)
    expect(cdpCalls).toEqual([])
  })

  it('leaves the ordinary web alone without asking anyone', async () => {
    PAGE.url = 'https://ru.wikipedia.org/wiki/x'
    const { BROWSER_TOOLS } = await import('./src/browser/agent-tools')
    const click = BROWSER_TOOLS.find(t => t.name === 'browser_click')!

    await expect(
      click.handler({ x: 1, y: 2 }, ctxWith(null))
    ).resolves.toBeTruthy()
    expect(cdpCalls).toContain('clickAt')
  })

  it('tells the agent WHAT TO DO NEXT, not merely no', async () => {
    PAGE.url = 'https://online.sberbank.ru/'
    const { BROWSER_TOOLS } = await import('./src/browser/agent-tools')
    const type = BROWSER_TOOLS.find(t => t.name === 'browser_type')!

    /*
     * An agent told only "no" tries again, tries differently, and eventually
     * tries something worse. The refusal has to name the way through.
     */
    await expect(type.handler({ text: 'x' }, ctxWith(null))).rejects.toThrow(
      /browser_ask_permission/
    )
  })
})

describe('the browser keeps its keys in its own rooms', () => {
  it('TREATS THE VAULT AND THE SETTINGS AS SENSITIVE', async () => {
    const { isSensitive } = await import('./src/browser/guard')
    for (const url of [
      'chrome-extension://nngceckbapebfimnlniiiahkandclblb/popup/index.html#/vault',
      'chrome://settings/passwords',
      'chrome://password-manager/passwords',
      'chrome://extensions/',
      'devtools://devtools/bundled/inspector.html',
    ])
      expect(isSensitive(url, []), url).toBe(true)
  })

  it('leaves a new tab and a blank page free', async () => {
    const { isSensitive } = await import('./src/browser/guard')
    expect(isSensitive('chrome://newtab/', [])).toBe(false)
    expect(isSensitive('about:blank', [])).toBe(false)
  })

  it('LETS AN AGENT OPEN THE WEB, AND NOTHING OF THE BROWSER ITSELF', async () => {
    const { agentMayOpen } = await import('./src/browser/guard')
    expect(agentMayOpen('https://habr.com/ru/feed/')).toBe(true)
    expect(agentMayOpen('http://example.com')).toBe(true)
    expect(agentMayOpen('about:blank')).toBe(true)
    for (const url of [
      'chrome://settings/passwords',
      'chrome-extension://nngceckbapebfimnlniiiahkandclblb/popup/index.html',
      'devtools://devtools/bundled/inspector.html',
      'file:///home/neko/.config/chromium/Default/Cookies',
      'javascript:alert(1)',
      'data:text/html,<b>x</b>',
      'not a url',
    ])
      expect(agentMayOpen(url), url).toBe(false)
  })
})
