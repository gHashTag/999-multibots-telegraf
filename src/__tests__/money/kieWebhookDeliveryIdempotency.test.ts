/**
 * Kie.ai / Sora video webhooks are delivered at-least-once. The route answers
 * 202 then processes in the background, and the charge was made idempotent per
 * job (chargedVideoJobs) but the DELIVERY was not: two concurrent deliveries of
 * the same completed job both pass videoTaskStore.getTask before either
 * deleteTask, so both reach sendVideo — the user receives the video (and the
 * public Pulse repost via sendMediaToPulse) twice. A SEQUENTIAL duplicate that
 * arrives after the task was deleted falls to the direct path (sendVideoDirectly)
 * and re-delivers there.
 *
 * The fix mirrors the sibling poller (handleTextToVideoDirect.ts): a bounded
 * module-scope delivered-set claimed synchronously by the immutable jobId before
 * any delivery await. It is applied to ALL THREE delivery paths — handleSoraSuccess
 * and notifyJobCompletion (task-found) and sendVideoDirectly (task-not-found
 * fallback, the call-site the first-pass plan missed).
 *
 * Source-level seam test (delivery is behind live Telegram + billing I/O; a
 * behavioral test cannot force the concurrent double-send and would be a false
 * ruler). Mutation — dropping the set, dropping a per-branch claim, moving a
 * claim after its sendVideo, or dropping the FIFO bound — fails it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(
  __dirname,
  '..',
  '..',
  'api_server',
  'routes',
  'kie-ai-webhook.routes.ts'
)

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const code = () => stripComments(fs.readFileSync(SRC, 'utf8'))

// slice a function body from its declaration to the next top-level async function
function fnBody(s: string, decl: string): string {
  const start = s.indexOf(decl)
  if (start < 0) return ''
  const next = s.indexOf('\nasync function ', start + decl.length)
  return s.slice(start, next < 0 ? s.length : next)
}

describe('kie/sora webhook video delivery is idempotent per job', () => {
  it('declares a bounded module-scope delivered-set + a synchronous claim helper', () => {
    const s = code()
    expect(
      /const deliveredVideoJobs = new Set<string>\(\)/.test(s),
      'no module-scope delivered-set'
    ).toBe(true)
    expect(
      /function claimVideoJobDelivery/.test(s),
      'no claimVideoJobDelivery helper'
    ).toBe(true)
    expect(
      /deliveredVideoJobs\.has\(jobId\)/.test(s),
      'helper does not check the delivered-set'
    ).toBe(true)
    expect(
      /deliveredVideoJobs\.add\(jobId\)/.test(s),
      'helper does not record the delivered job'
    ).toBe(true)
  })

  it('bounds the delivered-set with FIFO eviction (no unbounded growth)', () => {
    const s = code()
    const m = s.match(/const DELIVERED_VIDEO_JOBS_MAX = (\d+)/)
    expect(m, 'delivered-set is not bounded').not.toBeNull()
    expect(Number(m![1])).toBeGreaterThan(0)
    expect(
      /deliveredVideoJobs\.size > DELIVERED_VIDEO_JOBS_MAX[\s\S]{0,180}deliveredVideoJobs\.delete/.test(
        s
      ),
      'no FIFO eviction when the delivered-set exceeds its cap'
    ).toBe(true)
  })

  it('claims delivery BEFORE sendVideo in every delivery path', () => {
    const s = code()
    const paths: Array<[string, string]> = [
      ['async function sendVideoDirectly', 'metadata.jobId'],
      ['async function handleSoraSuccess', 'taskId'],
      ['async function notifyJobCompletion', 'taskId'],
    ]
    for (const [decl, key] of paths) {
      const body = fnBody(s, decl)
      expect(body.length, `${decl} not found`).toBeGreaterThan(0)
      const claim = body.search(
        new RegExp(`claimVideoJobDelivery\\(${key.replace('.', '\\.')}\\)`)
      )
      const send = body.indexOf('sendVideo(')
      expect(
        claim,
        `${decl}: no claimVideoJobDelivery(${key})`
      ).toBeGreaterThan(-1)
      expect(send, `${decl}: no sendVideo`).toBeGreaterThan(-1)
      expect(claim, `${decl}: claim must run BEFORE sendVideo`).toBeLessThan(
        send
      )
    }
  })
})
