/**
 * Guard: money and security fixes must not vanish from main again.
 *
 * On 2026-08-29 the loop's anomaly scan found FIVE merged fixes missing from
 * main. Nothing had reverted them on purpose: a branch cut BEFORE the merge
 * touched the same files and landed AFTER, silently overwriting the work.
 * Typecheck, tests and deploy all stayed green -- the code was simply gone.
 *
 * A regression that leaves no red is invisible, so this test makes each fix
 * assert its own presence by a marker that cannot survive being overwritten.
 * If one disappears again, this goes red at the next push instead of waiting
 * for a scan weeks later.
 *
 * Adding a fix worth protecting? Add its marker here in the same commit.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const read = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf8')

const SERVER = read('render-server.ts')
const AGENT_ROUTES = read('src/agent/routes.ts')
// The crediting logic was extracted here so it could be tested without
// spending money (stars-credit.test.ts). The marker follows the code: this
// guard checks that the fix still EXISTS, not that it sits in one file.
const STARS_CREDIT = read('src/stars-credit.ts')

describe('merged money fixes are still in main', () => {
  it('#873: the token-purchase webhook is idempotent', () => {
    // A redelivered Telegram payment used to credit twice; the ledger table is
    // what makes the second delivery a no-op. Now proven behaviourally too --
    // stars-credit.test.ts mutation-fails when the dedup is removed.
    expect(STARS_CREDIT).toContain('star_payments')
    expect(STARS_CREDIT).toContain('ON CONFLICT (charge_id) DO NOTHING')
    // And the server must actually call it, or the guarantee is theoretical.
    expect(SERVER).toContain('creditStarsPayment')
  })

  it('#874: /api/tokens/verify compares dates numerically', () => {
    // A string compare made the fallback verification never credit anything.
    expect(SERVER).toContain('Number(t.date)')
  })

  it('#1047: the Mini App generation paths are billed', () => {
    expect(SERVER).toContain('chargeMiniAppUser')
    expect(SERVER).toContain('refundMiniAppUser')
  })
})

describe('merged security fixes are still in main', () => {
  it('#878: the agent key is compared in constant time', () => {
    expect(AGENT_ROUTES).toContain('timingSafeEqual')
    // Present AND used: an imported-but-unused helper protects nothing.
    expect(AGENT_ROUTES).toMatch(/sameKey\([^)]*\)/)
  })

  it('the agent key is never compared with a plain ===', () => {
    const naive = /\bkey\s*===\s*\w|\w\s*===\s*AGENT_KEY/.test(AGENT_ROUTES)
    expect(naive).toBe(false)
  })
})
