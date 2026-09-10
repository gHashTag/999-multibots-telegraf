import { describe, it, expect } from 'vitest'
import {
  isReplicateNotFound,
  RETIRED_ERROR,
} from '@/inngest_app/functions/training/checkStuckTrainings'

/**
 * A training Replicate answers 404 for can never become terminal: the webhook
 * will not come and `trainings.get` will keep failing. Before this rule the
 * watchdog logged the same "[CHECK STUCK] Failed to check training on
 * Replicate" every 30 minutes (rows from 2025-12-02 were still alerting on
 * 2026-09-10). The rule retires the row; the user is not messaged.
 */
describe('a training Replicate no longer knows is retired, not retried', () => {
  it('recognises the replicate-js 404 error by message', () => {
    const err = new Error(
      'Request to https://api.replicate.com/v1/trainings/6mehygy1d1rm80ctvyrb4eakr4 failed with status 404 Not Found: {"detail":"The requested resource could not be found.","status":404}\n.'
    )
    expect(isReplicateNotFound(err)).toBe(true)
  })

  it('recognises a 404 carried on the response object', () => {
    const err = Object.assign(new Error('Not Found'), {
      response: { status: 404 },
    })
    expect(isReplicateNotFound(err)).toBe(true)
  })

  it('does not retire on other failures — those are still worth retrying', () => {
    expect(
      isReplicateNotFound(new Error('status 500 Internal Server Error'))
    ).toBe(false)
    expect(isReplicateNotFound(new Error('fetch failed'))).toBe(false)
    expect(
      isReplicateNotFound(
        Object.assign(new Error('x'), { response: { status: 429 } })
      )
    ).toBe(false)
    expect(isReplicateNotFound(null)).toBe(false)
  })

  it('the DB row says why it was retired and by whom', () => {
    expect(RETIRED_ERROR).toMatch(/404/)
    expect(RETIRED_ERROR).toMatch(/training-stuck-check/)
  })
})
