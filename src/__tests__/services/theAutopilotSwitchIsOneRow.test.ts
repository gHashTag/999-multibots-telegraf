/**
 * ONE SWITCH, TWO SERVICES, ONE ROW.
 *
 * The autopilot window lives in `crm_autopilot`: the bot writes it from its
 * buttons (`src/services/crmAutopilot.ts`) and the render reads and flips it
 * from the app (`apps/vibee-editor/render/src/agent/autopilot-tools.ts`). Two
 * copies of the same SQL are how one gets fixed and the other forgotten --
 * and the price of forgetting here is a message that left without a press, or
 * a screen that says "off" while the bot is sending.
 *
 * So the strings are compared, the way `assistant_opt_outs` is pinned against
 * its own twin. The table, the read, the on and the off must be identical
 * byte for byte, and the two constants that bound the feature must agree.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..', '..', '..')
const bot = readFileSync(resolve(root, 'src/services/crmAutopilot.ts'), 'utf8')
const render = readFileSync(
  resolve(root, 'apps/vibee-editor/render/src/agent/autopilot-tools.ts'),
  'utf8'
)

/** The body of `export const NAME = \`...\`` as written, backticks stripped. */
function sql(source: string, name: string): string {
  const at = source.indexOf(`export const ${name} = \``)
  expect(at, `${name} is gone`).toBeGreaterThan(-1)
  const from = source.indexOf('`', at) + 1
  const to = source.indexOf('`', from)
  return source.slice(from, to)
}

const numberOf = (source: string, name: string): number => {
  const m = new RegExp(`export const ${name} = (\\d+)`).exec(source)
  expect(m, `${name} is gone`).toBeTruthy()
  return Number(m![1])
}

describe('the two copies of the switch', () => {
  for (const name of [
    'AUTOPILOT_TABLE',
    'AUTOPILOT_READ',
    'AUTOPILOT_ON',
    'AUTOPILOT_OFF',
  ]) {
    it(`${name} is the same statement in both`, () => {
      expect(sql(render, name)).toBe(sql(bot, name))
    })
  }

  it('the window and the daily cap agree', () => {
    expect(numberOf(render, 'AUTOPILOT_HOURS')).toBe(
      numberOf(bot, 'AUTOPILOT_HOURS')
    )
    expect(numberOf(render, 'AUTOPILOT_DAILY_CAP')).toBe(
      numberOf(bot, 'AUTOPILOT_DAILY_CAP')
    )
  })

  it('only the BOT spends the budget: the render never takes a send', () => {
    /*
     * The one statement that decrements the day's budget belongs where a card
     * is actually sent, in a single UPDATE so two sweeps cannot both spend the
     * last one. A copy of it in the render would be a second place that can
     * spend -- and neither would know about the other.
     */
    expect(bot).toContain('AUTOPILOT_TAKE')
    expect(render).not.toContain('AUTOPILOT_TAKE')
    expect(render).not.toContain('sent_today + 1')
  })
})
