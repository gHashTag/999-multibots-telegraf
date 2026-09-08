import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/*
 * AN ALARM THAT CALLS A DELIBERATE CONFIGURATION A FAULT TEACHES PEOPLE TO
 * IGNORE ALARMS.
 *
 * `tri factory` printed FACTORY STALLED for sixteen days and named three
 * suspects, none of which was the answer. The service logs say it plainly: the
 * daemon is alive, the queue refills, and delivery refuses because
 * TG_POST_MAX_PER_DAY is unset -- a quota of zero, which channel-delivery.ts
 * documents as deliberate. The drain stays off until somebody raises it,
 * because a dozen unposted reels are already in the channel and raising it
 * without seeding the ledger would repost them.
 *
 * So the alarm still speaks -- sixteen days of silence is worth seeing -- but
 * it names the likeliest cause first, and that cause is the system's own
 * default.
 */
const TRI = fs.readFileSync(path.join(process.cwd(), 'tri'), 'utf8')

/** The branch that runs when the feed's newest item is old. */
function staleBranch(): string {
  const at = TRI.indexOf('no post for')
  expect(at, 'the staleness verdict must still exist').toBeGreaterThan(-1)
  return TRI.slice(at - 200, at + 900)
}

describe('the factory alarm names the likeliest cause first', () => {
  it('does not call a deliberate configuration a stall', () => {
    /*
     * Comment lines excluded, for the reason this project keeps relearning: a
     * quotation is not an invocation. The note explaining the change quotes
     * the old wording, and a checker counting mentions would read the
     * explanation of a fix as the fix's absence.
     */
    const code = TRI.split('\n').filter(l => !l.trim().startsWith('#'))
    expect(code.join('\n')).not.toContain('FACTORY STALLED')
  })

  it('names the quota, and names it before the other suspects', () => {
    const b = staleBranch()
    const quota = b.indexOf('TG_POST_MAX_PER_DAY')
    const daemon = b.indexOf('AUTOPILOT_LOOP')
    expect(quota, 'the actual cause must be named').toBeGreaterThan(-1)
    expect(daemon, 'the other suspects stay listed').toBeGreaterThan(-1)
    expect(quota, 'the likeliest cause must come first').toBeLessThan(daemon)
  })

  it('says the zero is a choice, not a fault', () => {
    expect(staleBranch()).toMatch(/defaults to 0|delivery is OFF/)
  })

  it('warns rather than failing, since silence may be intended', () => {
    // The distinction the old version lost: `bad` is for a fault, `warn` is for
    // something worth seeing that may be exactly what was asked for.
    const b = staleBranch()
    expect(b).toContain('warn "no post for')
    expect(b).not.toContain('bad "no post for')
  })

  it('still returns non-zero, so a caller can act on it', () => {
    expect(staleBranch()).toContain('return 1')
  })
})
