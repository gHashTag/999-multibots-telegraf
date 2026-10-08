import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/*
 * A FINISHED VIDEO IS THE DIRECTOR'S NEWS (spec bot-event-tabs.t27).
 *
 * The KIE webhook and the lipsync manager deliver outside any update, so they
 * take a view of their bot instance (botInTab, tested in
 * src/spec/bot-event-tabs.test.ts). This pins that every delivery path takes
 * it, and -- in the webhook -- only AFTER the delivery claim: the claim must
 * come before any await, or a duplicate webhook slips through and the person
 * gets the video twice.
 */
const read = (p: string) => readFileSync(join(__dirname, '../..', p), 'utf8')

describe('reel deliveries land in the Director tab', () => {
  it('each KIE delivery path takes the tab after its claim', () => {
    const src = read('api_server/routes/kie-ai-webhook.routes.ts')
    const calls = [...src.matchAll(/botInTab\(/g)].map(m => m.index!)
    expect(calls).toHaveLength(3)
    for (const at of calls) {
      const before = src.slice(0, at)
      const claim = before.lastIndexOf('claimVideoJobDelivery(')
      const fn = before.lastIndexOf('\nasync function ')
      expect(claim).toBeGreaterThan(fn)
    }
  })

  it('the lipsync result takes the tab', () => {
    const src = read('core/lipsync/async-lipsync-manager.ts')
    const at = src.indexOf('private async sendSuccessResult(')
    const body = src.slice(at, src.indexOf('\n  }\n', at))
    expect(body).toContain("bot = await botInTab(bot, job.chatId, 'reel')")
  })
})
