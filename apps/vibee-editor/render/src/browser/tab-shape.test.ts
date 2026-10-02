import { describe, expect, it } from 'vitest'
import {
  isOwnSite,
  judgeShape,
  shapeExpression,
  shapeOfTabs,
  skipReason,
} from './tab-shape'

const page = (id: string, url: string) => ({ id, url })

describe('which tabs the sweep reads', () => {
  it('reads the web, skips the browser and the sensitive places', () => {
    expect(skipReason('https://x.com/home')).toBeNull()
    expect(skipReason('chrome://newtab/')).toBe('not a web page')
    expect(skipReason('chrome-extension://abc/vault.html')).toBe(
      'not a web page'
    )
    expect(skipReason('https://mail.google.com/mail/u/0')).toMatch(/sensitive/)
    expect(skipReason('not a url')).toBe('unreadable address')
  })

  it('checks staleness only on our own https sites', () => {
    expect(isOwnSite('https://t27.ai/')).toBe(true)
    expect(isOwnSite('https://app.t27.ai/#/hive')).toBe(true)
    expect(isOwnSite('http://t27.ai/')).toBe(false)
    expect(isOwnSite('https://evilt27.ai/')).toBe(false)
    expect(isOwnSite('https://www.instagram.com/accounts/login/')).toBe(false)
  })
})

describe('the expression run in the page', () => {
  it('parses as JavaScript both ways', () => {
    for (const stale of [true, false])
      expect(
        () => new Function(`return ${shapeExpression(stale)}`)
      ).not.toThrow()
  })

  it('never re-fetches with the person cookies', () => {
    expect(shapeExpression(true)).toContain('credentials: "omit"')
  })
})

describe('judging a page answer', () => {
  it('names a loaded page with no text as blank', () => {
    const s = judgeShape(page('a', 'https://t27.ai/'), {
      ready: 'complete',
      nodes: 12,
      text: 0,
      draft: 0,
    })
    expect(s.anomalies).toEqual(['blank'])
  })

  it('a page still loading is not blank', () => {
    const s = judgeShape(page('a', 'https://t27.ai/'), {
      ready: 'loading',
      nodes: 5,
      text: 0,
    })
    expect(s.anomalies).toEqual([])
  })

  it('names stale bundles and unsent composer text', () => {
    const s = judgeShape(page('a', 'https://x.com/compose/post'), {
      ready: 'complete',
      nodes: 900,
      text: 400,
      draft: 37,
      stale: true,
    })
    expect(s.anomalies).toEqual(['stale', 'draft'])
    expect(s.draft).toBe(37)
  })

  it('an answer without counts is unread, not healthy', () => {
    const s = judgeShape(page('a', 'https://x.com/'), null)
    expect(s.unread).toBe('page gave no answer')
    expect(s.anomalies).toEqual([])
  })
})

describe('sweeping every tab', () => {
  it('reads web tabs, skips the rest, and says why each failure failed', async () => {
    const asked: string[] = []
    const shapes = await shapeOfTabs(
      'cdp',
      [
        page('ok', 'https://t27.ai/'),
        page('new', 'chrome://newtab/'),
        page('mail', 'https://mail.google.com/'),
        page('boom', 'https://x.com/'),
        page('hang', 'https://linkedin.com/'),
      ],
      {
        evaluate: async (_cdp, id, expr) => {
          asked.push(id)
          if (id === 'boom') throw new Error('target closed')
          if (id === 'hang') return await new Promise(() => {})
          expect(expr).toContain('const v')
          return { ready: 'complete', nodes: 40, text: 10, draft: 0 }
        },
      },
      50
    )
    expect(asked.sort()).toEqual(['boom', 'hang', 'ok'])
    const by = Object.fromEntries(shapes.map(s => [s.id, s]))
    expect(by.ok.anomalies).toEqual([])
    expect(by.new.unread).toBe('not a web page')
    expect(by.mail.unread).toMatch(/sensitive/)
    expect(by.boom.unread).toBe('page did not answer: target closed')
    expect(by.hang.unread).toMatch(/no answer in/)
  })

  it('asks for staleness only where it is checked', async () => {
    const exprs: Record<string, string> = {}
    await shapeOfTabs(
      'cdp',
      [page('own', 'https://t27.ai/'), page('theirs', 'https://x.com/')],
      {
        evaluate: async (_c, id, expr) => {
          exprs[id] = expr
          return { ready: 'complete', nodes: 1, text: 1 }
        },
      }
    )
    expect(exprs.own).toContain('if (!true')
    expect(exprs.theirs).toContain('if (!false')
  })
})
