import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HIVE_TOOLS } from './src/agent/hive-tools'
import { safeTitle } from './src/hive/queen-client'

/**
 * THE QUEEN AT t27.ai -- WHO MAY LOOK, AND WHAT HAPPENS WHEN SHE IS SILENT.
 *
 * She is a different hive: she judges code in `gHashTag/trios`, not this
 * platform. Two properties are worth pinning down.
 *
 * FIRST, KEEPER ONLY. Her API is public and unauthenticated, and that is
 * precisely the trap: "it is public anyway" is how internal engineering state
 * ends up on a bot owner's screen. The agent chat is the same screen for an
 * owner and for an ordinary user.
 *
 * SECOND, SILENCE IS NOT ZERO. "0 bees, 0 verdicts" and "she did not answer"
 * look identical on a dashboard and mean opposite things -- a quiet hive, or a
 * blind one. Reporting the second as the first is the whole failure of a status
 * panel.
 */

const tool = (name: string) => {
  const t = HIVE_TOOLS.find(t => t.name === name)
  if (!t) throw new Error(`no such tool: ${name}`)
  return t
}

const OWNERSHIP: Record<string, string[]> = { '2': ['bot_a'], '3': [] }

/** Enough of a pool for `visibilityOf`; the Queen tool never touches the db. */
const pool = {
  async query() {
    return { rows: [] }
  },
}

function stubAvatars() {
  return async (url: string) => {
    if (String(url).includes('/rest/v1/avatars')) {
      const m = String(url).match(/telegram_id=eq\.(\d+)/)
      const bots = OWNERSHIP[m?.[1] ?? ''] ?? []
      return {
        ok: true,
        json: async () => bots.map(b => ({ bot_name: b })),
      } as any
    }
    throw new Error(`unexpected fetch: ${url}`)
  }
}

beforeEach(() => {
  process.env.HIVE_KEEPERS = '1'
  process.env.SUPABASE_URL = 'https://example.invalid'
  process.env.SUPABASE_SERVICE_KEY = 'key'
})

describe('the Queen is keeper-only', () => {
  it('an ordinary person is refused, and the refusal names the role', async () => {
    vi.stubGlobal('fetch', stubAvatars())
    await expect(
      tool('hive_queen').handler({}, { pool, telegramId: '3' } as any)
    ).rejects.toThrow('смотрителю')
  })

  it('a BOT OWNER is refused too -- this is platform state, not their bot', async () => {
    /*
     * The case that is easy to get wrong. An owner legitimately sees their own
     * bots' events, and it is tempting to let them see "the engineering panel
     * as well". It names file paths and issue numbers of another repository.
     */
    vi.stubGlobal('fetch', stubAvatars())
    await expect(
      tool('hive_queen').handler({}, { pool, telegramId: '2' } as any)
    ).rejects.toThrow('смотрителю')
  })

  it('an unidentified caller does not even reach the role check', async () => {
    vi.stubGlobal('fetch', stubAvatars())
    await expect(
      tool('hive_queen').handler({}, { pool, telegramId: '' } as any)
    ).rejects.toThrow('личности')
  })
})

describe('when the Queen is silent she is not reported as quiet', () => {
  it('an unreachable Queen answers reachable:false and says what it means', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (String(url).includes('/rest/v1/avatars')) return stubAvatars()(url)
      throw new Error('connect ECONNREFUSED')
    })
    const out: any = await tool('hive_queen').handler({}, {
      pool,
      telegramId: '1',
    } as any)
    expect(out.reachable).toBe(false)
    // The distinction is spelled out for the reader, not left to be inferred
    // from a zero.
    expect(out.how_to_read).toContain('НЕ значит')
    expect(out.bees).toBeUndefined()
  })

  it('a keeper sees her numbers when she answers', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      const u = String(url)
      if (u.includes('/rest/v1/avatars')) return stubAvatars()(u)
      if (u.includes('/queen/status'))
        return {
          ok: true,
          json: async () => ({
            swarmState: 'waiting_for_review',
            workers: { capacity: 4, active: 0, idle: 4 },
            scheduler: { intervalSeconds: 300 },
            lastTick: {
              decidedAt: '2026-09-07T07:56:17.771Z',
              skippedCount: 198,
            },
          }),
        } as any
      if (u.includes('/queen/public-activity'))
        return {
          ok: true,
          json: async () => ({
            events: [
              {
                kind: 'review',
                issue: 1575,
                title: 'breaks L3',
                at: 'x',
                state: 'wait',
              },
            ],
          }),
        } as any
      if (u.includes('/queen/public-board'))
        return {
          ok: true,
          json: async () => ({
            repo: 'gHashTag/trios',
            cards: [
              { number: 1, column: 'review', title: 'a' },
              { number: 2, column: 'review', title: 'b' },
              { number: 3, column: 'done', title: 'c' },
            ],
          }),
        } as any
      throw new Error(`unexpected fetch: ${u}`)
    })

    const out: any = await tool('hive_queen').handler({}, {
      pool,
      telegramId: '1',
    } as any)
    expect(out.reachable).toBe(true)
    expect(out.repo).toBe('gHashTag/trios')
    expect(out.bees).toEqual({ capacity: 4, active: 0, idle: 4 })
    expect(out.board).toEqual({ review: 2, done: 1 })
    expect(out.awaiting_judgement).toHaveLength(2)
    expect(out.latest[0].issue).toBe(1575)
  })
})

describe('her titles are untrusted input', () => {
  /*
   * Titles come from another system and land in a model's context and,
   * through the report, in a Telegram message. A title that can forge a line
   * break can forge a whole message -- the same reasoning as device names in
   * `notify-sign-in`.
   */
  it('newlines cannot forge a continuation', () => {
    expect(safeTitle('ok\n\nYour code: 12345678')).not.toContain('\n')
  })

  it('a long title is trimmed rather than filling the screen', () => {
    expect(safeTitle('x'.repeat(500)).length).toBeLessThanOrEqual(161)
  })

  it('a missing title becomes an empty string, not "undefined"', () => {
    expect(safeTitle(undefined)).toBe('')
    expect(safeTitle(null)).toBe('')
  })
})
