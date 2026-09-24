import { describe, expect, it, vi } from 'vitest'
import {
  answerBrowserPermission,
  NOT_REACHED,
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
    const said = await answerBrowserPermission(TOKEN, { fetchImpl })
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
    expect(await answerBrowserPermission(TOKEN, { fetchImpl })).toBe(
      'Этот вопрос уже закрыт.'
    )
  })

  it('a render that is down leaves him with words, not a dead button', async () => {
    const refused = vi.fn(async () => ({ ok: false, status: 502 })) as never
    expect(await answerBrowserPermission(TOKEN, { fetchImpl: refused })).toBe(
      NOT_REACHED
    )
    const thrown = vi.fn(async () => {
      throw new Error('connection terminated')
    }) as never
    expect(await answerBrowserPermission(TOKEN, { fetchImpl: thrown })).toBe(
      NOT_REACHED
    )
  })

  it('an empty token is never sent anywhere', async () => {
    const fetchImpl = vi.fn() as never
    expect(await answerBrowserPermission('  ', { fetchImpl })).toBe(NOT_REACHED)
    expect(fetchImpl).not.toHaveBeenCalled()
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
