/**
 * Ratchet: every bot is launched through launchWithConflictRetry, which retries
 * ONLY on Telegram 409 Conflict.
 *
 * On Railway a redeploy overlaps the old and new instance; both poll getUpdates
 * for the same token and the newcomer gets 409 "terminated by other getUpdates
 * request". The launch used to be `bot.launch(...).catch(console.error)`: the
 * rejection was logged once and the bot stayed DEAD until the next deploy --
 * observed 2026-09-07 for neuro_blogger_bot and MetaMuse_Manifest_bot in two
 * consecutive deployments, during a night of seven deploys. A bounded retry
 * turns a dead bot into a late one. Non-409 errors are not retried.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const INDEX = path.resolve(__dirname, '../../index.ts')

function analyze(src: string): {
  launchesViaRetry: boolean
  bareLaunchChain: boolean
  retriesOnlyOn409: boolean
} {
  const helperStart = src.indexOf('async function launchWithConflictRetry(')
  const helper =
    helperStart >= 0
      ? src.slice(helperStart, src.indexOf('\n}\n', helperStart))
      : ''
  return {
    launchesViaRetry: /launchWithConflictRetry\(bot,\s*botInfo\.username/.test(
      src
    ),
    // the old shape: a direct .launch({...}) chained straight into .catch
    bareLaunchChain:
      /\bbot\s*\n?\s*\.launch\(\{[\s\S]{0,400}?\}\)\s*\n?\s*\.then\(/.test(src),
    retriesOnlyOn409:
      /error_code === 409/.test(helper) &&
      /terminated by other getUpdates/.test(helper) &&
      /if \(!conflict \|\| attempt >= attempts\)/.test(helper),
  }
}

describe('bots are launched with a bounded retry on 409 Conflict', () => {
  const src = fs.readFileSync(INDEX, 'utf8')
  const a = analyze(src)

  it('floor: the helper exists and the call site goes through it', () => {
    expect(src).toContain('async function launchWithConflictRetry(')
    expect(a.launchesViaRetry).toBe(true)
  })

  it('no bare bot.launch().then().catch() chain remains at the call site', () => {
    expect(a.bareLaunchChain).toBe(false)
  })

  it('the helper retries only on 409 and gives up on anything else', () => {
    expect(a.retriesOnlyOn409).toBe(true)
  })

  it('self-check: the old shape is detected as a bare chain', () => {
    const old = `const botPromise = bot
        .launch({ allowedUpdates: ['message'] })
        .then(() => console.log('ok'))
        .catch(error => console.error(error))`
    expect(analyze(old).bareLaunchChain).toBe(true)
    expect(analyze(old).launchesViaRetry).toBe(false)
  })

  it('mutation: bypassing the helper at the call site turns the check RED', () => {
    const mutated = src.replace(
      /launchWithConflictRetry\(bot,\s*botInfo\.username,\s*\[/,
      'bot.launch({ allowedUpdates: ['
    )
    expect(mutated).not.toEqual(src)
    expect(analyze(mutated).launchesViaRetry).toBe(false)
  })
})
