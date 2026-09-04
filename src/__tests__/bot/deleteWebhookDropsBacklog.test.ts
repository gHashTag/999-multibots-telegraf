import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Switching a bot from webhook mode to polling must drop whatever Telegram
 * queued while the webhook endpoint was unreachable.
 *
 * Telegram holds undelivered updates for 24 hours. Deleting the webhook
 * without drop_pending_updates hands that entire backlog to the poller the
 * moment the bot comes back, and those updates are real user commands that
 * reach scene handlers which charge for generation. A backlog replay during an
 * incident is precisely when a storm of paid commands is least wanted.
 *
 * bot.ts had two sites doing the same thing and disagreeing about it: the dev
 * path near the top drops the backlog -- its comment calls it the 409 fix --
 * while the production multi-bot path did not. Same intent, same file,
 * different decision, and the one that mattered was the second.
 *
 * Pinned as a POPULATION rather than as two line numbers: every deleteWebhook
 * in the file must drop, so a third site added later cannot quietly reintroduce
 * the replay. That form is chosen deliberately -- a hand-written list of the
 * sites already known is what let these two drift apart.
 */

const ROOT = path.resolve(__dirname, '../../..')
const FILE = 'src/bot.ts'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { matchCode } = require('../../../scripts/lib/blank-code.cjs')

const source = fs.readFileSync(path.join(ROOT, FILE), 'utf8')

/** Uncommented deleteWebhook calls, with their argument text. */
const deleteWebhookCalls = (): string[] =>
  matchCode(source, /deleteWebhook\(([^)]*)\)/g).map(
    (m: RegExpMatchArray) => m[1]
  )

describe('leaving webhook mode for polling', () => {
  it('still deletes the webhook somewhere', () => {
    // Control. An empty population would make the assertion below pass while
    // checking nothing -- and the matcher skips comments, so a commented-out
    // call cannot prop it up either.
    expect(deleteWebhookCalls().length).toBeGreaterThanOrEqual(2)
  })

  it('drops pending updates at every call', () => {
    const withoutDrop = deleteWebhookCalls().filter(
      args => !/drop_pending_updates:\s*true/.test(args)
    )
    expect(withoutDrop).toEqual([])
  })

  it('still launches in polling, so the backlog has somewhere to land', () => {
    // If polling disappeared the rule above would keep passing while guarding
    // nothing: there would be no poller for a backlog to reach.
    expect(source).toMatch(/usePolling/)
    expect(source).toMatch(/bot\.launch\(/)
  })
})
