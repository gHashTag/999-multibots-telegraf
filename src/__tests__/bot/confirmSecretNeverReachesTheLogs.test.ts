import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { scrubCallbackSecrets, scrubbedLog } from '@/utils/scrubCallbackSecrets'

/**
 * A SECRET IN A LOG HAS LEFT THE BUILDING.
 *
 * The one-time secret that authorises sending a prepared message rides in the
 * button's callback data, so Telegram can hand it back on the press and the
 * bot needs no state between showing a card and the tap.
 *
 * The cost, measured on this branch before the fix: the bot printed callback
 * data wholesale in two places, so EVERY press wrote the live secret to stdout
 * in full. Neither `redactBotToken` nor `sanitizeForLogging` touches it -- the
 * first matches only bot tokens, the second only collapses Buffers. Anybody
 * able to read the logs could lift a secret and confirm a send.
 *
 * This is the ratchet. The repository already carries one of exactly this
 * shape for the Stars webhook secret; there was none for this one, and the
 * only test that mentioned the secret asserted it IS in the callback data.
 */

// Invented for this file: 32 hex characters in the shape the real generator
// produces, so the scrubber is exercised on the thing it will actually meet.
// secret-guard-ok: invented for this test, not a real secret
const SECRET = '0'.repeat(24) + 'deadbeef'
const REAL = `tgp:ok:0f3a91cc42de:${SECRET}`

afterEach(() => vi.restoreAllMocks())

describe('the secret is cut out, the id is not', () => {
  it('a bare callback string is scrubbed', () => {
    const out = scrubCallbackSecrets(REAL)
    expect(out).not.toContain(SECRET)
    // The id survives on purpose: the whole reason to log a press is to be
    // able to answer "who confirmed what", and the id alone is useless.
    expect(out).toContain('0f3a91cc42de')
  })

  it('cancel is scrubbed too, not only confirm', () => {
    const out = scrubCallbackSecrets(`tgp:no:0f3a91cc42de:${SECRET}`)
    expect(out).not.toContain(SECRET)
  })

  it('a whole serialised update is scrubbed', () => {
    /*
     * This is the shape that actually leaked: `Telegraf.log` calls
     * `JSON.stringify(ctx.update, null, 2)` and hands over one big string, so
     * a field-by-field scrubber never sees the field.
     */
    const update = JSON.stringify(
      { update_id: 1, callback_query: { id: '9', data: REAL } },
      null,
      2
    )
    expect(scrubCallbackSecrets(update)).not.toContain(SECRET)
  })

  it('scrubbedLog prints the scrubbed form', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    scrubbedLog(JSON.stringify({ data: REAL }))
    const printed = spy.mock.calls.flat().join(' ')
    expect(printed).not.toContain(SECRET)
  })

  it('unrelated text is untouched, including other callbacks', () => {
    // A scrubber that eats things it does not understand makes logs useless,
    // which is how it ends up being removed.
    for (const s of ['act:topup', 'обычная строка', 'tgp', '']) {
      expect(scrubCallbackSecrets(s)).toBe(s)
    }
  })
})

describe('no logging site prints callback data raw', () => {
  const read = (...p: string[]) =>
    fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8')

  it('Telegraf.log is given the scrubbing logger everywhere', () => {
    /*
     * Three call sites, and a fourth is one copy-paste away. Checked as a
     * ratchet over the source rather than per site, so a new one fails here
     * instead of leaking quietly.
     */
    for (const f of ['index.ts', 'bot.ts']) {
      const src = read(f)
      expect(src, `${f} logs updates raw`).not.toContain(
        'Telegraf.log(console.log)'
      )
      if (src.includes('Telegraf.log(')) {
        expect(src).toContain('Telegraf.log(scrubbedLog)')
      }
    }
  })

  it('the incoming-update log scrubs the callback field', () => {
    const src = read('navigation', 'registerCommands.ts')
    const i = src.indexOf('callback:')
    expect(i, 'the incoming-update log is gone').toBeGreaterThan(-1)
    expect(src.slice(i, i + 120)).toContain('scrubCallbackSecrets')
  })
})
