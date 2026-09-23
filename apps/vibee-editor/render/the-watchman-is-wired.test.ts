import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A WATCHMAN NOBODY STARTED IS A FILE, NOT A WATCHMAN.
 *
 * The decision has nine tests of its own (src/bots/silence-watch.test.ts) and
 * the wiring has none it can afford -- it is queries, a token lookup and a
 * sendMessage. What can rot silently is the tick itself: deleted, or pointed
 * at the wrong bot, or told to shout through the bot that is down.
 */

const SERVER = readFileSync(join(__dirname, 'render-server.ts'), 'utf8')

describe('the bot-silence watch is actually running', () => {
  it('has a tick, and a slow one', () => {
    expect(SERVER).toContain("import('./src/bots/silence-wiring')")
    expect(SERVER).toContain('runSilenceWatch')
    // Ten minutes. A watchman's pace: three misses before it speaks means a
    // real outage is reported within about half an hour, and a blink never is.
    const at = SERVER.indexOf('runSilenceWatch')
    expect(SERVER.slice(at, at + 2600)).toMatch(/10 \* 60 \* 1000/)
  })

  it('says one line every tick, not only when it has bad news', () => {
    // Measured 2026-09-23, first live run: a quiet watchman and a watchman
    // that never started wrote the same log -- nothing. Telling them apart
    // took twenty minutes and a hand-written query against the database.
    const at = SERVER.indexOf('runSilenceWatch')
    const block = SERVER.slice(at, at + 2600)
    expect(block).toContain('[bot-silence] checked ')
    expect(block).toContain('round.checked')
    expect(block).toContain('round.silent')
  })

  it('reads the answer to its own sendMessage', () => {
    // Fire-and-forget records the owner as told when Telegram refused (403 for
    // a chat they never started), and then the outage is never announced again.
    const at = SERVER.indexOf('runSilenceWatch')
    const block = SERVER.slice(at, at + 2600)
    expect(block).toMatch(/body\?\.ok/)
    expect(block).toContain('return false')
  })

  it('speaks through the platform bot, never through the one that fell', () => {
    const at = SERVER.indexOf('runSilenceWatch')
    const block = SERVER.slice(at - 1200, at + 2600)
    expect(block).toMatch(/TELEGRAM_BOT_TOKEN \|\| process\.env\.BOT_TOKEN_1/)
    // The message is addressed to the owner's chat id, which is what the
    // alarm carries -- not to a bot, and not to a client.
    expect(block).toContain('chat_id: ownerId')
  })

  it('cannot take the server down with it', () => {
    const at = SERVER.indexOf('[bot-silence] failed:')
    expect(at).toBeGreaterThan(-1)
    expect(SERVER.slice(at - 400, at)).toContain('catch')
  })
})
