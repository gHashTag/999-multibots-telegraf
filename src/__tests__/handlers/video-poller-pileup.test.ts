/**
 * The video status poller must not pile up overlapping requests.
 *
 * handleTextToVideoDirect polls generation status on a setInterval(5s). Because
 * setInterval fires regardless of whether the previous async callback finished,
 * a slow or stalled status check would let a second one start on top of it and
 * accumulate — and the underlying axios.get had no timeout, so a stalled server
 * could hang each call forever (the #1020/#1021 class).
 *
 * The poller runs inline in a setInterval and is integration-shaped, so this
 * asserts the two guards structurally, mutation-checked:
 *   - the interval skips a tick while a check is in flight (re-entrancy guard);
 *   - the status axios.get is bounded by a timeout.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { enclosedBy } = require('../../../scripts/lib/enclosing-statement.cjs')

describe('video status poller does not pile up requests', () => {
  it('skips a tick while a check is still in flight', () => {
    const src = fs.readFileSync(
      'src/handlers/handleTextToVideoDirect.ts',
      'utf8'
    )
    // the interval body must bail out when a previous check has not returned
    expect(src).toMatch(/let checkInFlight = false/)
    expect(src).toMatch(/if \(checkInFlight\) return/)
    // and it must reset the flag so polling continues after a check returns
    expect(
      enclosedBy(src, 'checkInFlight = false', /^\}?\s*finally\s*\{$/),
      'the flag must be reset in a finally, or one throw stops the polling'
    ).toBe(true)
  })

  it('bounds the status request with a timeout so it cannot hang forever', () => {
    const src = fs.readFileSync('src/services/generateTextToVideo.ts', 'utf8')
    const call = src.match(
      /axios\.get<TextToVideoResponse>\(url,\s*\{[\s\S]*?\}\)/
    )
    expect(call, 'status axios.get not found').not.toBeNull()
    expect(call![0], 'status axios.get has no timeout').toMatch(/timeout:/)
  })
})
