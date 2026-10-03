import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  answerBrowserPermission,
  NOT_REACHED,
  SAID,
  tapBrowserPermission,
} from '@/services/browserApproval'

/*
 * THE PERMISSION BUTTON THAT DID NOTHING ON HIS PHONE.
 *
 * Owner, 2026-09-24: "the agent sent a link again that does not open in
 * Telegram, so it does not work". The two buttons were `url` buttons: a tap
 * left Telegram for the phone's default browser, which holds no session of
 * ours. The rule had been written down two days earlier and lived in a
 * comment in one file; this flow, three files away, never got it.
 *
 * Now the tap is a callback, the token rides in the data, and this is the
 * only thing between the tap and the approval row.
 */
/*
 * A SHAPE, NOT A SECRET. Built rather than written out, because the token
 * guard reads a 32-character literal in a variable as a real one -- and it
 * is right to: a secret in git history is revoked, never deleted.
 */
const TOKEN = 'a'.repeat(32) // secret-guard-ok: a repeated letter, not a value
const KEY = 'k'.repeat(8) // secret-guard-ok: a repeated letter, not a value
// The retry waits 3 s in production; a test does not.
const sleep = async () => undefined

describe('the tap reaches the approval, and the person hears back', () => {
  it('asks the render for the ANSWER, not for a page', async () => {
    let seen: { url?: string; accept?: unknown } = {}
    const fetchImpl = vi.fn(async (url: string, init: any) => {
      seen = { url, accept: init?.headers?.Accept }
      return {
        ok: true,
        json: async () => ({
          ok: true,
          state: 'allowed',
          said: 'Разрешено. Агент продолжит.',
        }),
      }
    }) as never
    const said = await answerBrowserPermission(TOKEN, { fetchImpl, key: KEY })
    expect(said).toContain('Разрешено')
    expect(seen.url).toContain(`t=${TOKEN}`)
    // Scraping its own back end for HTML would be the wrong shape.
    expect(seen.accept).toBe('application/json')
  })

  it('takes the render words, so the two never disagree in front of him', async () => {
    // The render is the side that knows whether the question was still open.
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        state: null,
        said: 'Этот вопрос уже закрыт.',
      }),
    })) as never
    expect(await answerBrowserPermission(TOKEN, { fetchImpl, key: KEY })).toBe(
      'Этот вопрос уже закрыт.'
    )
  })

  it('a render that is down leaves him with words, not a dead button', async () => {
    const refused = vi.fn(async () => ({ ok: false, status: 502 })) as never
    expect(
      await answerBrowserPermission(TOKEN, {
        fetchImpl: refused,
        key: KEY,
        sleep,
      })
    ).toBe(SAID.restarting)
    const thrown = vi.fn(async () => {
      throw new Error('connection terminated')
    }) as never
    expect(
      await answerBrowserPermission(TOKEN, {
        fetchImpl: thrown,
        key: KEY,
        sleep,
      })
    ).toBe(SAID.offline)
  })

  it('an empty token is never sent anywhere', async () => {
    const fetchImpl = vi.fn() as never
    expect(await answerBrowserPermission('  ', { fetchImpl, key: KEY })).toBe(
      NOT_REACHED
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('carries the server key, or the guard answers 401 before the route', async () => {
    /*
     * Production, 2026-10-03 04:31: "the render refused the tap {status:401}".
     * The render's global guard stands in front of /api/browser/approve and
     * lets nothing through without X-Api-Key; the relay sent none, so every
     * "Allow" since #2939 ended in NOT_REACHED.
     */
    let sent: unknown
    const fetchImpl = vi.fn(async (_u: string, init: any) => {
      sent = init?.headers?.['X-Api-Key']
      return { ok: true, json: async () => ({ said: 'ok' }) }
    }) as never
    await answerBrowserPermission(TOKEN, { fetchImpl, key: KEY })
    expect(sent).toBe(KEY)
  })

  it('with no key it says so in the log and sends nothing doomed', async () => {
    const fetchImpl = vi.fn() as never
    expect(await answerBrowserPermission(TOKEN, { fetchImpl, key: '' })).toBe(
      SAID.noKey
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('the route is still behind the render guard, so the key is not optional', async () => {
    // If someone makes the route public, this test says the key can go;
    // until then, dropping it is the 401 above.
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const guard = readFileSync(
      join(__dirname, '../../../apps/vibee-editor/render/auth.ts'),
      'utf8'
    )
    expect(guard).not.toContain("'/api/browser/approve'")
    const relay = readFileSync(
      join(__dirname, '../../services/browserApproval.ts'),
      'utf8'
    )
    expect(relay).toContain("'X-Api-Key': key")
  })

  it('the bot registers a handler for the data the render sends', async () => {
    /*
     * A source read, and the pair it holds is the whole point: the render
     * writes `bap:<token>` into callback_data and the bot must answer that
     * exact prefix. A button whose data nobody handles is a button that does
     * nothing -- the same silence the url button produced, one layer in.
     */
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const bot = readFileSync(
      join(__dirname, '../../navigation/registerCommands.ts'),
      'utf8'
    )
    const render = readFileSync(
      join(
        __dirname,
        '../../../apps/vibee-editor/render/src/browser/agent-tools.ts'
      ),
      'utf8'
    )
    const sent = /APPROVAL_TAP = '([a-z:]+)'/.exec(render)
    expect(sent, 'the render no longer names its callback prefix').toBeTruthy()
    expect(bot).toContain(`/^${sent![1]}(.+)$/`)
  })
})

/*
 * "WHY DOES THE CRM BOT KEEP SAYING IT COULD NOT PASS THE ANSWER ON?"
 *
 * Owner, 2026-10-03. One sentence stood for four failures, and the one that
 * fired for nine days (a 401: the bot never sent its key) is the one that
 * "try again in a minute" can never cure. Each failure has its own words now,
 * a deploy-minute blip is retried once before he hears anything, and the
 * card keeps a button to press.
 */
describe('the failed tap says why, and the button stays', () => {
  const said = (s: string) => ({ ok: true, json: async () => ({ said: s }) })

  it('a 502 during a deploy swap is retried once, and he only hears the answer', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce(said('Разрешено. Агент продолжит.')) as never
    const waits: number[] = []
    const r = await tapBrowserPermission(TOKEN, {
      fetchImpl,
      key: KEY,
      sleep: async ms => void waits.push(ms),
    })
    expect(r).toEqual({
      said: 'Разрешено. Агент продолжит.',
      reached: true,
      why: 'answered',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(waits).toEqual([3000])
  })

  it('a 401 is never retried: the second request would get the same refusal', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401 })) as never
    const r = await tapBrowserPermission(TOKEN, { fetchImpl, key: KEY, sleep })
    expect(r.why).toBe('noKey')
    expect(r.reached).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('tries at most twice, whatever keeps failing', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503 })) as never
    const r = await tapBrowserPermission(TOKEN, { fetchImpl, key: KEY, sleep })
    expect(r).toMatchObject({ reached: false, why: 'restarting' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('a 200 with no words is not an answer', async () => {
    const fetchImpl = vi.fn(async () => said('  ')) as never
    const r = await tapBrowserPermission(TOKEN, { fetchImpl, key: KEY, sleep })
    expect(r.reached).toBe(false)
  })

  it('every failure tells him the button is back, because the bot puts it back', () => {
    for (const words of Object.values(SAID)) expect(words).toContain('Кнопка')
    const bot = readFileSync(
      join(__dirname, '../../navigation/registerCommands.ts'),
      'utf8'
    )
    for (const prefix of ['bap:(.+)', 'mtg:(ok|later']) {
      const at = bot.indexOf(prefix)
      expect(at, prefix).toBeGreaterThan(0)
      const body = bot.slice(at, at + 1200)
      expect(body, prefix).toContain('if (!r.reached')
      expect(body, prefix).toContain('restoreButtons(ctx)')
      // Immediate feedback, before the relay starts waiting.
      expect(body.indexOf('answerCbQuery('), prefix).toBeLessThan(
        body.indexOf('stripButtons(ctx)')
      )
    }
    expect(bot).toContain('ctx.callbackQuery?.message?.reply_markup')
  })
})
