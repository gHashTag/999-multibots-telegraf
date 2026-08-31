/**
 * Webhook FAILURE / content-policy notifications must be idempotent (#1352).
 *
 * kie.ai/Sora webhooks are at-least-once. The SUCCESS delivery paths claim the
 * job id before sending (claimVideoJobDelivery), but the direct-mode FAILURE and
 * content-policy handlers sent their error text with no claim, so a provider
 * retry re-sent the same error message. This wires a SEPARATE claimer
 * (claimVideoFailureNotify — its own set, so it never suppresses a success
 * delivery) as a guard before each of the four direct error sends.
 *
 * These handlers are internal to the route module and reach Supabase + the bot,
 * so this is a structural guard, mutation-checked: in each failure/policy
 * handler the claim guard must appear BEFORE its direct sendMessage.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const SRC = fs.readFileSync(
  'src/api_server/routes/kie-ai-webhook.routes.ts',
  'utf8'
)

const HANDLERS = [
  'handleSoraFailure',
  'handleSoraContentPolicy',
  'handleFailedGeneration',
  'handleContentPolicyError',
]

function fnRegion(name: string): string {
  const start = SRC.indexOf(`async function ${name}(`)
  expect(start, `${name} not found`).toBeGreaterThan(-1)
  const nextFn = SRC.indexOf('\nasync function ', start + 1)
  return SRC.slice(start, nextFn === -1 ? undefined : nextFn)
}

describe('webhook failure/content-policy notifications are idempotent', () => {
  it('uses a SEPARATE claimer from the success-delivery one', () => {
    expect(SRC).toContain(
      'const claimVideoFailureNotify = createVideoDeliveryClaimer()'
    )
    expect(SRC).toContain(
      'const claimVideoJobDelivery = createVideoDeliveryClaimer()'
    )
  })

  for (const name of HANDLERS) {
    it(`${name} claims before its direct sendMessage`, () => {
      const region = fnRegion(name)
      const guardIdx = region.indexOf(
        '!claimVideoFailureNotify(taskId)) return'
      )
      const sendIdx = region.indexOf('botInstance.telegram.sendMessage(')
      expect(
        guardIdx,
        `${name}: no failure-notify claim guard`
      ).toBeGreaterThan(-1)
      expect(sendIdx, `${name}: no direct sendMessage`).toBeGreaterThan(-1)
      expect(guardIdx, `${name}: claim must come before the send`).toBeLessThan(
        sendIdx
      )
    })
  }
})
