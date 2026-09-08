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
 * ADDING A SHARED SESSION STORE MAKES THIS FAIL TOO, and that is deliberate. A
 * Redis-backed session would make the guards durable -- an improvement -- but
 * the registries that describe them say "in-memory", and someone has to update
 * that description rather than let it quietly become false.
 */

const ROOT = path.resolve(__dirname, '../../..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

describe('the money guards assume exactly one process', () => {
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

  it('the session store is shared (Redis) -- session-held guards are durable; the marketplace Set is not', () => {
    // 2026-09-08: sessions moved to Redis (src/core/session/sessionStore.ts)
    // because 15 redeploys in 3 hours wiped every wizard. The 18 in-progress
    // flags and 3 consume-once marks live in the session, so they now survive
    // a restart and would be shared between replicas. The marketplace in-flight
    // Set is still module state in one process -- which is why numReplicas
    // above must stay 1 until it gets a durable claim.
    const bot = read('src/bot.ts')
    const index = read('src/index.ts')
    for (const src of [bot, index]) {
      expect(src).toMatch(/bot\.use\(sessionMiddleware\(\)\)/)
      expect(src, 'a bare in-memory session() came back').not.toMatch(
        /bot\.use\(session\(\)\)/
      )
    }
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
