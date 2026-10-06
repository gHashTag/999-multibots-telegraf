/**
 * A DESK THAT PRESSES OR TYPES ASKS THE SAME QUESTION AS THE TOOLS.
 *
 * 2026-10-03: the agent tools refuse to act on a site the person put on
 * "ask", on a bank or a mail box, and on an address they cannot read, unless
 * the person said yes in the last five minutes (agent-tools.ts
 * mustBeAllowedToAct). The desks -- blog-share, reddit, engage, scenarios --
 * press and type over raw CDP and asked only deskMayGo, which knows "block"
 * and nothing else: x.com on "ask" still had the blog desk post there with
 * no question. deskClick and deskType check where the tab is NOW, so a
 * redirect after the open is caught at the press too.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const at = { url: 'https://x.com/compose/post' }
const pressed: string[] = []
vi.mock('./src/browser/cdp', async importOriginal => ({
  ...(await importOriginal<typeof import('./src/browser/cdp')>()),
  pageUrl: async () => at.url,
  clickAt: async (_c: string, id: string) => void pressed.push(`click ${id}`),
  typeText: async (_c: string, id: string, text: string) =>
    void pressed.push(`type ${id} ${text}`),
}))

import {
  DESK_WHEEL_TAKEN,
  deskClick,
  deskMayAct,
  deskType,
} from './src/browser/desk-page'
import { resetSiteRulesCache } from './src/browser/site-rules'
import { PERMISSION_WINDOW_MS } from './src/browser/guard'

const NOW = Date.parse('2026-10-03T12:00:00Z')

/** One person: their list, when they last said yes, until when they drive. */
function person(
  rules: Array<{ site: string; rule: string }>,
  session: {
    allowedAtMs?: number | null
    allowedHost?: string | null
    wheelUntilMs?: number | null
  } = {}
) {
  return {
    telegramId: '144',
    pool: {
      query: async (sql: string) => {
        if (sql.includes('FROM browser_site_rules'))
          return {
            rows: rules.map(r => ({
              ...r,
              by_whom: 'person',
              at: new Date(NOW).toISOString(),
            })),
          }
        if (sql.includes('FROM browser_sessions'))
          return {
            rows: [
              {
                telegram_id: '144',
                session_id: 's',
                state: 'live',
                cdp_endpoint: 'cdp',
                allowed_ms: session.allowedAtMs ?? null,
                allowed_host: session.allowedHost ?? null,
                wheel_ms: session.wheelUntilMs ?? null,
              },
            ],
          }
        return { rows: [] }
      },
    },
  }
}

beforeEach(() => {
  resetSiteRulesCache()
  pressed.length = 0
  at.url = 'https://x.com/compose/post'
})

describe('deskMayAct: the tools’ question, asked at the desk', () => {
  it('control: a plain site with no rule acts with no yes at all', async () => {
    await expect(
      deskMayAct(person([]), 'https://x.com/compose/post', NOW)
    ).resolves.toBeUndefined()
  })

  it('an "ask" site with no yes is refused', async () => {
    await expect(
      deskMayAct(
        person([{ site: 'x.com', rule: 'ask' }]),
        'https://x.com/compose/post',
        NOW
      )
    ).rejects.toThrow(/needs the person's fresh yes/)
  })

  it('an "ask" site with a yes for it inside the window acts', async () => {
    const who = person([{ site: 'x.com', rule: 'ask' }], {
      allowedAtMs: NOW - PERMISSION_WINDOW_MS + 1_000,
      allowedHost: 'x.com',
    })
    await expect(
      deskMayAct(who, 'https://x.com/compose/post', NOW)
    ).resolves.toBeUndefined()
  })

  it('a fresh yes for another place (or for no place) does not open x.com', async () => {
    for (const allowedHost of ['online.sberbank.ru', null]) {
      const who = person([{ site: 'x.com', rule: 'ask' }], {
        allowedAtMs: NOW - 1_000,
        allowedHost,
      })
      await expect(
        deskMayAct(who, 'https://x.com/compose/post', NOW),
        String(allowedHost)
      ).rejects.toThrow(/fresh yes/)
    }
  })

  it('a yes older than the window is no yes', async () => {
    const who = person([{ site: 'x.com', rule: 'ask' }], {
      allowedAtMs: NOW - PERMISSION_WINDOW_MS - 1_000,
      allowedHost: 'x.com',
    })
    await expect(
      deskMayAct(who, 'https://x.com/compose/post', NOW)
    ).rejects.toThrow(/fresh yes/)
  })

  it('a place guarded for everyone (a bank) needs a yes with an empty list', async () => {
    await expect(
      deskMayAct(person([]), 'https://online.sberbank.ru/pay', NOW)
    ).rejects.toThrow(/fresh yes/)
  })

  it('an address the desk cannot read is refused (fail closed)', async () => {
    await expect(deskMayAct(person([]), '', NOW)).rejects.toThrow(/fresh yes/)
  })

  it('while the person holds the wheel, nothing is pressed even with a yes', async () => {
    const who = person([], { allowedAtMs: NOW, wheelUntilMs: NOW + 60_000 })
    await expect(
      deskMayAct(who, 'https://x.com/compose/post', NOW)
    ).rejects.toThrow(DESK_WHEEL_TAKEN)
  })

  it('a wheel lease that ran out is not held', async () => {
    const who = person([], { wheelUntilMs: NOW - 1 })
    await expect(
      deskMayAct(who, 'https://x.com/compose/post', NOW)
    ).resolves.toBeUndefined()
  })

  it('a blocked site stays blocked, yes or no', async () => {
    const who = person([{ site: 'x.com', rule: 'block' }], {
      allowedAtMs: NOW,
    })
    await expect(
      deskMayAct(who, 'https://x.com/compose/post', NOW)
    ).rejects.toThrow(/block/i)
  })
})

describe('deskClick and deskType check where the tab is NOW', () => {
  it('nothing is pressed or typed on an "ask" site with no yes', async () => {
    const who = person([{ site: 'x.com', rule: 'ask' }])
    await expect(deskClick(who, 'cdp', 'p1', 1, 1)).rejects.toThrow(/fresh yes/)
    await expect(deskType(who, 'cdp', 'p1', 'hello')).rejects.toThrow(
      /fresh yes/
    )
    expect(pressed).toEqual([])
  })

  it('a tab that was redirected after the open is judged where it landed', async () => {
    /* Opened on an allowed page; the click would land on the asked one. */
    const who = person([{ site: 'linkedin.com', rule: 'ask' }])
    at.url = 'https://www.linkedin.com/feed/'
    await expect(deskClick(who, 'cdp', 'p1', 1, 1)).rejects.toThrow(/fresh yes/)
    expect(pressed).toEqual([])
  })

  it('a tab whose address comes back empty is refused, nothing pressed', async () => {
    /* A tab that is gone or still loading: the unknown place may be a bank. */
    at.url = ''
    const who = person([])
    await expect(deskClick(who, 'cdp', 'p1', 1, 1)).rejects.toThrow(/fresh yes/)
    await expect(deskType(who, 'cdp', 'p1', 'hello')).rejects.toThrow(
      /fresh yes/
    )
    expect(pressed).toEqual([])
  })

  it('control: a plain site is pressed and typed', async () => {
    const who = person([])
    await deskClick(who, 'cdp', 'p1', 1, 1)
    await deskType(who, 'cdp', 'p1', 'hello')
    expect(pressed).toEqual(['click p1', 'type p1 hello'])
  })
})

/*
 * THE PIN: no desk presses or types around the door. A raw act anywhere in
 * src/ outside the doors below is code acting with no question -- exactly
 * how the "ask" rule was missed the first time. A raw act is the cdp.ts
 * primitives (`clickAt`, `typeText`), the person-typing helpers
 * (`cdpTypeIo`, `typeLikeAPerson`) and the CDP input methods themselves
 * (`Input.dispatch*`, `Input.insertText`) -- the bee on #3503 named the last
 * four as the way around a pin that knew only the first two.
 */
const DOORS: Record<string, string> = {
  'src/browser/cdp.ts': 'the primitives themselves',
  'src/browser/desk-page.ts': 'deskClick/deskType: the desk door, asks first',
  'src/browser/agent-tools.ts':
    'the agent tools: mustBeAllowedToAct before every press and keystroke',
  'src/browser/person-type.ts':
    "the person's own typing: cdpTypeIo/typeLikeAPerson, never the agent's",
  'src/browser/routes.ts':
    'POST /api/browser/type: the person-only door (agent key gets 403)',
}
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : []
  })
}

/** Lines of `text` that name a raw act (comments stripped first). */
function rawActs(text: string): string[] {
  const code = text
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map(l => l.replace(/\/\/.*$/, ''))
  return code
    .map((l, i) => [i + 1, l] as const)
    .filter(([, l]) =>
      /\b(clickAt|typeText|cdpTypeIo|typeLikeAPerson)\b|\bInput\.(dispatch\w*|insertText)\b/.test(
        l
      )
    )
    .map(([n, l]) => `${n}: ${l.trim()}`)
}

describe('no desk acts around deskClick/deskType', () => {
  const root = import.meta.dirname
  const src = join(root, 'src')
  const dir = join(src, 'agent')
  const rel = (f: string) => relative(root, f).split(sep).join('/')

  it('src/ holds no raw act outside the named doors', () => {
    const bare = sources(src)
      .filter(f => !(rel(f) in DOORS))
      .flatMap(f => rawActs(readFileSync(f, 'utf8')).map(l => `${rel(f)}:${l}`))
    expect(bare).toEqual([])
  })

  it('every door on the list still acts (the list only shrinks)', () => {
    const idle = Object.keys(DOORS).filter(
      f => rawActs(readFileSync(join(root, f), 'utf8')).length === 0
    )
    expect(idle).toEqual([])
  })

  it('the pin sees a raw act, a renamed import and a destructured one', () => {
    expect(rawActs('await clickAt(cdp, id, 1, 1)')).toHaveLength(1)
    expect(rawActs("const { typeText: t } = await import('x')")).toHaveLength(1)
    expect(rawActs('io.clickAt(cdp, id, 1, 1)')).toHaveLength(1)
    expect(rawActs('await cdpTypeIo.type(cdp, page, text)')).toHaveLength(1)
    expect(rawActs('await typeLikeAPerson(call, text, true)')).toHaveLength(1)
    expect(
      rawActs("await call('Input.dispatchMouseEvent', { type: 'x' })")
    ).toHaveLength(1)
    expect(
      rawActs("await send('Input.dispatchKeyEvent', { type: 'keyDown' })")
    ).toHaveLength(1)
    expect(rawActs("await call('Input.insertText', { text })")).toHaveLength(1)
    expect(rawActs("await call('Input.setIgnoreInputEvents', {})")).toEqual([])
    expect(rawActs('// clickAt in a comment\n/* typeText */')).toEqual([])
    expect(rawActs('await deskClick(who, cdp, id, 1, 1)')).toEqual([])
  })

  it('the pin is not vacuous: the desks really use the door', () => {
    const all = sources(dir)
      .map(f => readFileSync(f, 'utf8'))
      .join('\n')
    expect(all.match(/\bdeskClick\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
    expect(all.match(/\bdeskType\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })
})
