/**
 * A DESK THAT OPENS THE PERSON'S BROWSER TELLS THEM ONCE, NOT EVERY HOUR.
 *
 * 2026-10-03: the Reddit desk ticks hourly and the reaper drops an idle visit
 * after ten minutes, so every tick opened a fresh visit -- and every opening
 * sent "the agent opened your browser" to the owner. One Telegram message an
 * hour, all night. The real start function is exercised here, with a journal
 * that remembers what was written.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { configureAgentStart, startBrowserAsAgent } from './src/browser/routes'
import { resetBrowserSessionsCache } from './src/browser/sessions'
import { resetJournalCacheForTests } from './src/browser/journal'
import {
  DESK_QUIET_MS,
  browserStartedMessage,
  deskStartMayAnnounce,
} from './src/browser/announce'

const WHO = '9000000072'
type Step = { at: number; tool: string; detail: Record<string, unknown> }
let journal: Step[] = []
let sent: string[] = []
let journalBroken = false

const pool = {
  query: async (sql: string, params: unknown[] = []) => {
    if (/INSERT INTO browser_journal/i.test(sql))
      journal.push({
        at: Date.now(),
        tool: String(params[1]),
        detail: JSON.parse(String(params[4])),
      })
    if (/SELECT max\(at\)/i.test(sql)) {
      if (journalBroken) throw new Error('journal gone')
      const told = journal.filter(
        s => s.tool === 'browser_start' && s.detail.announced === true
      )
      const at = told.length ? Math.max(...told.map(s => s.at)) : null
      return { rows: [{ at: at === null ? null : new Date(at).toISOString() }] }
    }
    if (/RETURNING profile_id/i.test(sql))
      return { rows: [{ profile_id: 'profile-1' }] }
    return { rows: [] }
  },
}

beforeEach(() => {
  journal = []
  sent = []
  journalBroken = false
  resetBrowserSessionsCache()
  resetJournalCacheForTests()
  configureAgentStart(
    () =>
      ({
        getPool: async () => pool,
        driver: {
          start: async () => ({
            podId: 'pod-1',
            endpoint: 'pod.internal:8080',
            cdpEndpoint: '',
            viewToken: '',
            adminToken: '',
          }),
          stop: async () => undefined,
          /* The reaper dropped the visit: every tick starts a fresh one. */
          alive: async () => false,
        },
        newToken: () => 'tok',
        env: {},
        announcer: {
          send: async (_id: string, text: string) => void sent.push(text),
        },
      }) as never
  )
})

describe('a desk tells the person once per quiet window', () => {
  it('the first desk start is announced, names the desk, and is marked', async () => {
    expect(await startBrowserAsAgent(WHO, 'reddit')).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('Reddit')
    expect(sent[0]).toContain('12 ч') // cyrillic-ok
    expect(journal[0].detail).toEqual({ by: 'reddit', announced: true })
  })

  it('the hourly ticks after it are quiet, and still journaled', async () => {
    await startBrowserAsAgent(WHO, 'reddit')
    await startBrowserAsAgent(WHO, 'reddit')
    await startBrowserAsAgent(WHO, 'engage')
    expect(sent).toHaveLength(1)
    expect(journal.map(s => s.detail)).toEqual([
      { by: 'reddit', announced: true },
      { by: 'reddit' },
      { by: 'engage' },
    ])
  })

  it('a start from a chat turn is announced every time', async () => {
    await startBrowserAsAgent(WHO, 'reddit')
    await startBrowserAsAgent(WHO)
    await startBrowserAsAgent(WHO)
    expect(sent).toHaveLength(3)
    expect(sent[2]).not.toContain('12 ч') // cyrillic-ok
  })

  it('a journal that cannot be read errs toward telling', async () => {
    journalBroken = true
    await startBrowserAsAgent(WHO, 'reddit')
    await startBrowserAsAgent(WHO, 'reddit')
    expect(sent).toHaveLength(2)
  })

  it('the window opens again after twelve hours', () => {
    const t = Date.parse('2026-10-03T01:11:45Z')
    expect(deskStartMayAnnounce(null, t)).toBe(true)
    expect(deskStartMayAnnounce(t, t + 60 * 60 * 1000)).toBe(false)
    expect(deskStartMayAnnounce(t, t + DESK_QUIET_MS - 1)).toBe(false)
    expect(deskStartMayAnnounce(t, t + DESK_QUIET_MS)).toBe(true)
  })

  it('the message keeps its web_app button', () => {
    const m = browserStartedMessage(undefined, 'reddit') as {
      replyMarkup: { inline_keyboard: Array<Array<Record<string, unknown>>> }
    }
    expect(m.replyMarkup.inline_keyboard[0][0].web_app).toBeTruthy()
  })
})
