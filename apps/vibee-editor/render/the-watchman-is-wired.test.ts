import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A WATCHMAN NOBODY STARTED IS A FILE, NOT A WATCHMAN.
 *
 * The decision has its own tests (src/bots/silence-watch.test.ts) and the
 * wiring has none it can afford -- it is queries, a token lookup and a
 * sendMessage. What can rot silently is the tick itself: deleted, or pointed at
 * the wrong bot, or told to shout through the bot that is down.
 *
 * WHY THE BLOCK IS FOUND BY ITS ENDS AND NOT BY A CHARACTER COUNT. The first
 * version of this file sliced a fixed 1200 characters after `runSilenceWatch`,
 * and every honest change to the tick broke it -- three times in one day, each
 * time a red test that had found nothing. A window measured in characters is a
 * test of how long the code is.
 */

const SERVER = readFileSync(join(__dirname, 'render-server.ts'), 'utf8')

/** The watchman's own setInterval, from its heading to its pace. */
function tickBlock(): string {
  const from = SERVER.indexOf('THE WATCHMAN:')
  expect(from).toBeGreaterThan(-1)
  const to = SERVER.indexOf('10 * 60 * 1000', from)
  expect(to).toBeGreaterThan(from)
  return SERVER.slice(from, to + 20)
}

describe('the bot-silence watch is actually running', () => {
  it('has a tick, and a slow one', () => {
    const block = tickBlock()
    expect(block).toContain("import('./src/bots/silence-wiring')")
    expect(block).toContain('runSilenceWatch')
    // Ten minutes. A watchman's pace: three misses before it speaks means a
    // real outage is reported within about half an hour, and a blink never is.
    expect(block).toMatch(/10 \* 60 \* 1000/)
  })

  it('says one line every tick, not only when it has bad news', () => {
    // Measured 2026-09-23, first live run: a quiet watchman and a watchman that
    // never started wrote the same log -- nothing. Telling them apart took
    // twenty minutes and a hand-written query against the database.
    const block = tickBlock()
    expect(block).toContain('[bot-silence] checked ')
    expect(block).toContain('round.checked')
    expect(block).toContain('round.silent')
    // And our own gap is counted apart from an outage, because it is a
    // different problem with a different fixer.
    expect(block).toContain('round.ours')
  })

  it('reads the answer to its own sendMessage', () => {
    // Fire-and-forget records the owner as told when Telegram refused (403 for
    // a chat they never started), and then the outage is never announced again.
    const block = tickBlock()
    expect(block).toMatch(/parsed\?\.ok/)
    expect(block).toContain('return false')
  })

  it('tells the operator when the gap is ours, and only then', () => {
    // A bot with no token on this server is an unfinished onboarding. The
    // client cannot fix it; on 2026-09-24 three of thirteen bots sat in that
    // state and the only person who could was never told.
    const block = tickBlock()
    expect(block).toMatch(/alarm\.side === 'ours'/)
    expect(block).toContain('OWNER_TELEGRAM_ID')
    expect(block).toContain('PLATFORM_OWNER_FALLBACK')
    // Never to the operator twice when the operator IS the owner.
    expect(block).toMatch(/operator !== alarm\.ownerId/)
    // And that copy must not decide whether the CLIENT was reached.
    expect(block).toMatch(/return reached/)
  })

  it('speaks through the platform bot, never through the one that fell', () => {
    const block = tickBlock()
    expect(block).toMatch(/TELEGRAM_BOT_TOKEN \|\| process\.env\.BOT_TOKEN_1/)
    // Addressed to a chat id the alarm carries -- not to a bot, not a client.
    expect(block).toContain('chat_id: chatId')
    expect(block).toContain('say(alarm.ownerId, alarm.text)')
  })

  it('cannot take the server down with it', () => {
    const at = SERVER.indexOf('[bot-silence] failed:')
    expect(at).toBeGreaterThan(-1)
    expect(SERVER.slice(at - 400, at)).toContain('catch')
  })
})
