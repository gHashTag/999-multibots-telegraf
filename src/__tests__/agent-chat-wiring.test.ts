import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * THE WIRING BETWEEN TELEGRAM AND THE AGENT.
 *
 * `registerCommands.ts` is two thousand lines inside one registration function
 * and cannot be exercised without a live bot, so these are source-level
 * ratchets. They are weak by nature and they still earn their place: the two
 * facts below had NO coverage at all, and one of them was a silent outage --
 * a photo sent into the agent chat produced no answer for months.
 *
 * Comments are stripped before matching. A test that goes green because a
 * comment mentions `next()` is exactly the decorative kind this repository has
 * already collected five of.
 */

const SOURCE = fs.readFileSync(
  path.join(process.cwd(), 'src/navigation/registerCommands.ts'),
  'utf8'
)

const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(
  /^\s*\/\/.*$/gm,
  ''
)

/** The photo handler's body, bounded at both ends. An unbounded slice would
 *  find a match in a neighbour a thousand lines away. */
function photoHandler(): string {
  const start = CODE.indexOf("bot.on(message('photo')")
  expect(start).toBeGreaterThan(-1)
  const end = CODE.indexOf('bot.use(async (ctx: any, next: any)', start)
  expect(end).toBeGreaterThan(start)
  return CODE.slice(start, end)
}

describe('a photo reaches the agent', () => {
  /*
   * The handler used to end with a log line and no `next()`. In Telegraf that
   * TERMINATES the chain, so the agent middleware below was never reached: the
   * person got neither an answer nor an error. The comment there even claimed
   * "передаем дальше" while nothing was passed anywhere.
   */
  it('the global photo handler hands the chain onward', () => {
    const body = photoHandler()
    expect(body).toContain('return next()')
  })

  it('the handler declares next, or it could not pass anything on', () => {
    expect(CODE).toContain("bot.on(message('photo'), async (ctx, next)")
  })
})

describe('the agent middleware takes files, not only text', () => {
  /*
   * The middleware began with `if (!('text' in ctx.message)) return next()`,
   * which dropped every document, video, voice, audio, video note and
   * animation before anything could look at them.
   */
  it('it no longer rejects everything that is not text up front', () => {
    const start = CODE.indexOf('bot.use(async (ctx: any, next: any)')
    expect(start).toBeGreaterThan(-1)
    const head = CODE.slice(start, start + 400)
    expect(head).not.toMatch(
      /if \(!ctx\.message \|\| !\('text' in ctx\.message\)\) return next\(\)/
    )
  })

  it('it builds the agent message through the shared builder', () => {
    expect(CODE).toContain('buildAgentMessage(ctx.telegram, ctx.message)')
  })

  it('a refusal is spoken to the person rather than swallowed', () => {
    expect(CODE).toMatch(
      /if \(plan\.refusal\) await ctx\.reply\(plan\.refusal\)/
    )
  })
})
