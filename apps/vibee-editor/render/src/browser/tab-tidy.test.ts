import { describe, expect, it } from 'vitest'
import {
  claimTidyAsk,
  planClose,
  rememberTidyAsk,
  resetTidyCache,
  tabsWord,
  tidyCandidates,
  tidyQuestion,
  whyAbandoned,
} from './tab-tidy'
import type { Queryable } from './sessions'

describe('which tabs look abandoned', () => {
  it('names the four found on the owner pod on 2026-10-03', () => {
    expect(
      whyAbandoned('https://www.reddit.com/r/t27ai/submit/?title=The%20seed')
    ).toBe('unfinished form')
    expect(
      whyAbandoned(
        'https://www.instagram.com/accounts/login/two_step_verification?x=1'
      )
    ).toBe('stuck sign-in')
    expect(
      whyAbandoned(
        'https://raw.githubusercontent.com/gHashTag/trinity-fpga/main/a'
      )
    ).toBe('raw file')
    expect(
      whyAbandoned('https://api.github.com/repos/gHashTag/x/contents/y')
    ).toBe('raw file')
  })

  it('leaves working pages alone', () => {
    for (const url of [
      'https://t27.ai/',
      'https://www.linkedin.com/search/results/content/?keywords=x',
      'https://www.tiktok.com/foryou',
      'https://studio.youtube.com/channel/U/editing/profile',
      'https://www.mercor.com/experts/',
      'https://example.com/submitted-work',
      'chrome://settings/',
    ])
      expect(whyAbandoned(url)).toBeNull()
  })
})

describe('the list asked about', () => {
  const page = (id: string, url: string) => ({ id, url })

  it('keeps the oldest of a duplicate and adds tabs named by hand', () => {
    const tabs = tidyCandidates(
      [
        page('a', 'https://t27.ai/'),
        page('b', 'https://t27.ai/'),
        page('c', 'https://www.mercor.com/experts/'),
        page('d', 'chrome://newtab/'),
      ],
      ['c']
    )
    expect(tabs.map(t => [t.id, t.why])).toEqual([
      ['b', 'duplicate'],
      ['c', 'named by hand'],
      ['d', 'empty tab'],
    ])
  })

  it('never asks to close every tab', () => {
    const tabs = tidyCandidates([
      page('a', 'https://raw.githubusercontent.com/a'),
      page('b', 'https://api.github.com/b'),
    ])
    expect(tabs.map(t => t.id)).toEqual(['b'])
  })

  it('a lone blank tab is a browser, not litter', () => {
    expect(tidyCandidates([page('a', 'chrome://newtab/')])).toEqual([])
  })

  it('the card names each place and says logins stay', () => {
    const text = tidyQuestion([
      {
        id: 'a',
        url: 'https://www.reddit.com/r/t27ai/submit/?title=x',
        why: 'unfinished form',
      },
    ])
    expect(text).toContain('1 лишнюю вкладку') // cyrillic-ok
    expect(text).toContain('reddit.com/r/t27ai/submit/')
    expect(text).toContain('Входы в аккаунты не трогаются') // cyrillic-ok
    expect(tabsWord(3)).toBe('лишние вкладки') // cyrillic-ok
    expect(tabsWord(12)).toBe('лишних вкладок') // cyrillic-ok
    expect(tabsWord(21)).toBe('лишнюю вкладку') // cyrillic-ok
  })
})

describe('applying a yes', () => {
  it('closes only the tabs still showing what was asked about', () => {
    const asked = [
      {
        id: 'a',
        url: 'https://raw.githubusercontent.com/a',
        why: 'raw file' as const,
      },
      {
        id: 'b',
        url: 'https://www.reddit.com/r/x/submit/',
        why: 'unfinished form' as const,
      },
      { id: 'c', url: 'chrome://newtab/', why: 'empty tab' as const },
    ]
    const { close, skipped } = planClose(asked, [
      { id: 'a', url: 'https://raw.githubusercontent.com/a' },
      { id: 'c', url: 'https://mail.google.com/' },
    ])
    expect(close.map(t => t.id)).toEqual(['a'])
    expect(skipped).toEqual([
      { id: 'b', why: 'already closed' },
      { id: 'c', why: 'moved to another page since the question' },
    ])
  })

  it('never empties the browser, even if he closed the rest himself', () => {
    const asked = [
      {
        id: 'b',
        url: 'https://www.reddit.com/r/x/submit/',
        why: 'unfinished form' as const,
      },
      {
        id: 'c',
        url: 'https://raw.githubusercontent.com/c',
        why: 'raw file' as const,
      },
    ]
    const { close, skipped } = planClose(asked, [
      { id: 'b', url: 'https://www.reddit.com/r/x/submit/' },
      { id: 'c', url: 'https://raw.githubusercontent.com/c' },
    ])
    expect(close.map(t => t.id)).toEqual(['c'])
    expect(skipped).toEqual([{ id: 'b', why: 'last tab stays' }])
  })

  it('a yes is spent once, and only by its own person', async () => {
    resetTidyCache()
    const rows = new Map<
      string,
      { tg: string; tabs: string; applied: boolean }
    >()
    const q: Queryable = {
      async query(sql: string, params: unknown[] = []) {
        if (sql.includes('CREATE TABLE')) return { rows: [] }
        if (sql.startsWith('INSERT')) {
          rows.set(String(params[0]), {
            tg: String(params[1]),
            tabs: String(params[2]),
            applied: false,
          })
          return { rows: [] }
        }
        const r = rows.get(String(params[0]))
        if (!r || r.applied || r.tg !== String(params[1])) return { rows: [] }
        r.applied = true
        return { rows: [{ tabs: r.tabs }] }
      },
    } as unknown as Queryable
    const tabs = [
      { id: 'a', url: 'chrome://newtab/', why: 'empty tab' as const },
    ]
    await rememberTidyAsk(q, 'q1', '144', tabs)
    expect(await claimTidyAsk(q, 'q1', '999')).toBeNull()
    expect(await claimTidyAsk(q, 'q1', '144')).toEqual(tabs)
    expect(await claimTidyAsk(q, 'q1', '144')).toBeNull()
  })
})
