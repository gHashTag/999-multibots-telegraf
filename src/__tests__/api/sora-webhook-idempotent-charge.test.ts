/**
 * A delivered-video charge must fire at most once per job.
 *
 * Provider webhooks (Kie/Sora) are delivered at-least-once, and the two mounted
 * video-callback routes answer 202 then process asynchronously, so two duplicate
 * deliveries of the same completed job can run concurrently. Both used to reach
 * chargeForDeliveredVideo, and each inserted a payments_v2 debit keyed on a
 * per-call timestamp (not the job), so one delivered video was billed twice.
 *
 * chargeForDeliveredVideo is a private webhook handler that reaches Supabase and
 * the balance helpers, so this asserts the fix structurally, mutation-checked:
 * a per-job Set, and a synchronous has/add claim that runs BEFORE the charge, so
 * a duplicate job is skipped (the claim only ever skips a charge, never adds one).
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const SRC = fs.readFileSync(
  'src/api_server/routes/kie-ai-webhook.routes.ts',
  'utf8'
)

describe('delivered-video charge is idempotent per job', () => {
  it('declares a per-process charged-jobs set', () => {
    expect(SRC).toMatch(/const chargedVideoJobs = new Set<string>\(\)/)
  })

  it('claims the job (has -> add) before it charges', () => {
    const fnStart = SRC.indexOf('async function chargeForDeliveredVideo')
    expect(fnStart).toBeGreaterThan(-1)
    const hasIdx = SRC.indexOf('chargedVideoJobs.has(jobId)', fnStart)
    const addIdx = SRC.indexOf('chargedVideoJobs.add(jobId)', fnStart)
    const chargeIdx = SRC.indexOf('deductBalanceAfterSuccess', fnStart)

    expect(hasIdx, 'no chargedVideoJobs.has(jobId) guard').toBeGreaterThan(
      fnStart
    )
    expect(addIdx, 'the guard must add after it checks').toBeGreaterThan(hasIdx)
    expect(chargeIdx, 'the claim must come before the charge').toBeGreaterThan(
      addIdx
    )
  })
})
