import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Ratchet: every double-charge guard in this repository is PER-PROCESS, and the
 * thing that makes that safe is `numReplicas = 1` in railway.toml.
 *
 * The three mechanisms have all been censused now, and each census answers
 * "is the guard present?". None of them answers "does the guard survive a
 * second process?" -- and measured, none of them does:
 *
 *   18 scene in-progress flags   ctx.session.<X>InProgress
 *    3 consume-once marks        ctx.session.lastUpscaled*
 *    1 marketplace in-flight Set a module-level Set (#1861)
 *
 * All of them live in memory. The session is `bot.use(session())` -- Telegraf's
 * default, with no store: nothing is written anywhere, so a second instance
 * starts with an empty session for every user and shares no flag with the first.
 * Two replicas mean two users' worth of guards that cannot see each other, and
 * a double tap routed to different instances passes both checks and charges
 * twice.
 *
 * railway.toml says numReplicas = 1, so today this is sound. But nothing
 * connected that number to the money: someone raising it to handle load would
 * be making a routine scaling change that silently invalidates twenty-one
 * guards, with no test anywhere to say so.
 *
 * WHAT THIS IS NOT. It is not a claim that one process is the right
 * architecture, and not a refusal to scale. It is a tripwire on an assumption
 * that is currently invisible: raise the replica count, or give the session a
 * shared store, and this fails with the list of what must be re-examined first.
 *
 * ADDING A SHARED SESSION STORE MAKES THIS FAIL TOO, and that is deliberate.
 * It fired: #2230 gave the session a Redis store, and the answer turned out to
 * be neither "durable now, relax" nor "revert". The wizard POSITION and the
 * consume-once marks should persist; the in-progress LOCKS should not, because
 * a lock nobody can release is worse than a lock that dies with its process.
 * They are excluded by name in sessionStore.isVolatileField.
 */

const ROOT = path.resolve(__dirname, '../../..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

describe('the money guards assume exactly one process', () => {
  /*
   * WHAT THIS TEST CAN AND CANNOT SEE, 2026-09-19.
   *
   * It reads the DECLARED number. The effective one lives in the deployment
   * Railway ran and can be set from Railway's own UI -- the same class of gap
   * that let the mini app read the bot's config for nine days while the
   * repository looked correct. `tri replicas` reads that side (and adds
   * multiRegionConfig up: one replica in each of two regions is two processes
   * while the top-level number still says 1). Measured that day: one process,
   * one region.
   *
   * It is a command and not an assertion here on purpose -- a test that needs
   * Railway fails on an aeroplane, and a money guard that cannot run offline is
   * a money guard that gets skipped.
   */
  it('railway.toml still pins a single replica', () => {
    const cfg = read('railway.toml')
    const m = cfg.match(/numReplicas\s*=\s*(\d+)/)
    expect(m, 'railway.toml must state numReplicas explicitly').toBeTruthy()
    expect(
      Number((m as RegExpMatchArray)[1]),
      `Raising the replica count breaks every per-process guard at once: 18 ` +
        `scene in-progress flags, 3 consume-once marks and the marketplace ` +
        `in-flight Set all live in the in-memory Telegraf session or in module ` +
        `state, so a second instance shares none of them and a double tap routed ` +
        `to two instances charges twice. Give the session a shared store and give ` +
        `the marketplace Set a durable claim FIRST, then update this test.`
    ).toBe(1)
  })

  it('the session store is shared (Redis), and the locks deliberately are NOT', () => {
    // 2026-09-08, two changes on one day. #2230 moved sessions to Redis because
    // 15 redeploys in 3 hours wiped every wizard mid-dialogue. That made the
    // wizard position and the 3 consume-once marks durable, which is right.
    //
    // It also made the 27 <x>InProgress locks durable, which is not: every one
    // of them is released in a `finally` or a `.leave()`, and neither runs when
    // the process dies. A person who tapped twice during a generation had the
    // flag written to Redis by the guard's own rejection; the redeploy then
    // killed the handler, and nothing was left to clear it. So the lock family
    // is excluded from the store (isVolatileField) and lives per process,
    // exactly as before -- while the marketplace in-flight Set was always
    // module state. Both are why numReplicas above must stay 1.
    const bot = read('src/bot.ts')
    const index = read('src/index.ts')
    for (const src of [bot, index]) {
      expect(src).toMatch(/bot\.use\(sessionMiddleware\(\)\)/)
      expect(src, 'a bare in-memory session() came back').not.toMatch(
        /bot\.use\(session\(\)\)/
      )
    }
    const store = read('src/core/session/sessionStore.ts')
    expect(
      store,
      'the lock family must stay out of Redis: a lock outliving its holder locks the person out for good'
    ).toMatch(/LOCK_FIELD\s*=\s*\/InProgress\$\//)
  })

  it('the guards this protects are still the ones counted here', () => {
    // A floor, so the numbers in the message above cannot rot into fiction.
    // Counting the flags rather than trusting the prose that mentions them.
    const scenes: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), {
        withFileTypes: true,
      })) {
        const rel = `${dir}/${e.name}`
        if (e.isDirectory()) walk(rel)
        else if (e.name.endsWith('.ts')) scenes.push(rel)
      }
    }
    walk('src/scenes')
    const inProgressFiles = scenes.filter(f =>
      /ctx\.session\.\w*InProgress\s*=\s*true/.test(read(f))
    )
    expect(
      inProgressFiles.length,
      'the in-progress guard family shrank -- re-check what still protects those scenes'
    ).toBeGreaterThanOrEqual(15)
  })
})
