import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  decide,
  fingerprint,
  withSuppressedCount,
  WINDOW_MS,
  MAX_TRACKED,
  type ThrottleState,
} from '@/utils/alertThrottle'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sliceBetween } = require('../../../scripts/lib/anchored-slice.cjs')

/*
 * THE OWNER'S CHANNEL WENT LIVE THIS MORNING AND WOULD BE BURIED BY THE FIRST
 * OUTAGE.
 *
 * A verified census found thirteen sites that fire on a timer for a PERSISTENT
 * condition: the notification poller alone is 1440 messages a day while Supabase
 * is unreachable, the Redis paths up to 2880, one image-to-video request 120 in
 * four minutes.
 *
 * Fixing thirteen call sites would leave the class open -- roughly 250 more
 * error sites were never classified. So the rule sits at the choke point every
 * alert already passes through.
 *
 * The line between this and muting is the count. A suppressed repeat is counted
 * and the next message that gets through carries the number, so one alert still
 * means "once" and a storm still reads as a storm.
 */
const ROOT = path.resolve(__dirname, '../../..')
const codeOf = (p: string) =>
  fs
    .readFileSync(path.join(ROOT, p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter(l => !l.trim().startsWith('//'))
    .join('\n')

const T0 = 1_000_000_000

describe('one incident is one message', () => {
  it('the first of its kind goes out', () => {
    const seen = new Map<string, ThrottleState>()
    expect(decide(seen, 'k', T0)).toEqual({ send: true, suppressed: 0 })
  })

  it('a repeat inside the window is held back and counted', () => {
    const seen = new Map<string, ThrottleState>()
    decide(seen, 'k', T0)
    expect(decide(seen, 'k', T0 + 60_000)).toEqual({
      send: false,
      suppressed: 1,
    })
    expect(decide(seen, 'k', T0 + 120_000)).toEqual({
      send: false,
      suppressed: 2,
    })
  })

  it('after the window it goes out AGAIN, carrying what was held back', () => {
    // Not muting: the storm still reaches the owner, once, with its size.
    const seen = new Map<string, ThrottleState>()
    decide(seen, 'k', T0)
    for (let i = 1; i <= 9; i++) decide(seen, 'k', T0 + i * 60_000)
    const out = decide(seen, 'k', T0 + WINDOW_MS + 1)
    expect(out.send).toBe(true)
    expect(out.suppressed).toBe(9)
    expect(withSuppressedCount('Redis is down', out.suppressed)).toContain('+9')
  })

  it('the count resets after it is reported, so it is a rate and not a total', () => {
    const seen = new Map<string, ThrottleState>()
    decide(seen, 'k', T0)
    decide(seen, 'k', T0 + 60_000)
    decide(seen, 'k', T0 + WINDOW_MS + 1)
    const next = decide(seen, 'k', T0 + 2 * WINDOW_MS + 2)
    expect(next.suppressed).toBe(0)
  })

  it('two different failures are two incidents', () => {
    const seen = new Map<string, ThrottleState>()
    decide(seen, fingerprint('Redis is down'), T0)
    expect(decide(seen, fingerprint('Supabase is down'), T0).send).toBe(true)
  })

  it('a retry counter inside the text is not a new incident', () => {
    // Otherwise "attempt 3 of 20" and "attempt 4 of 20" are twenty incidents
    // and the throttle never matches anything.
    expect(fingerprint('attempt 3 of 20 failed')).toBe(
      fingerprint('attempt 4 of 20 failed')
    )
    expect(fingerprint('attempt 3 failed')).not.toBe(
      fingerprint('payment 3 failed')
    )
  })

  it('the same text from different places stays separate', () => {
    expect(fingerprint('failed', 'notificationHandler')).not.toBe(
      fingerprint('failed', 'sessionStore')
    )
  })

  it('one broken step across many jobs is ONE incident, not one per job', () => {
    /*
     * The digit rule alone did not reach this. Seventeen titles in the reels
     * render pipeline read `Failed to … for job ${job_id}`, and a job id is a
     * uuid -- letters and all -- so masking digits left `#a#bc#-d#ef-…`, still
     * unique per job. Twenty jobs hitting one broken step was twenty pushes.
     */
    const a = 'Failed to render job 7c9e6679-7425-40de-944b-e07fc1f90ae7:'
    const b = 'Failed to render job 110ec58a-a0f2-4ac4-8393-c866d813b8d1:'
    expect(fingerprint(a)).toBe(fingerprint(b))

    // Casing is not a second incident either.
    expect(fingerprint('job 7C9E6679-7425-40DE-944B-E07FC1F90AE7 died')).toBe(
      fingerprint('job 7c9e6679-7425-40de-944b-e07fc1f90ae7 died')
    )

    // A provider's opaque task id behaves the same way.
    expect(
      fingerprint('kie task d41d8cd98f00b204e9800998ecf8427e failed')
    ).toBe(fingerprint('kie task 5eb63bbbe01eeed093cb22bb8f5acdc3 failed'))
  })

  it('but a DIFFERENT step on the same job is still a different incident', () => {
    // The whole point of the masking is that only the identifier collapses.
    const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
    expect(fingerprint(`Failed to render job ${id}:`)).not.toBe(
      fingerprint(`Failed to upload result for job ${id}:`)
    )
  })

  it('two different failure descriptions are never merged into one', () => {
    /*
     * The mistake that would be worse than the noise. Normalising the PROSE --
     * an attractive way to make the throttle match more often -- would hide the
     * second, genuinely different failure for ten minutes. Only identifiers are
     * masked, never the words.
     */
    expect(fingerprint('Ошибка Supabase: connection refused')).not.toBe(
      fingerprint('Ошибка Supabase: permission denied')
    )
    expect(fingerprint('xAI 401 Unauthorized')).not.toBe(
      fingerprint('xAI 404 Model not found')
    )
  })

  it('a full table evicts the coldest, never stops alerting', () => {
    // The failure that matters: a bounded map must not become "never alert
    // again" once it fills, nor "never throttle again".
    const seen = new Map<string, ThrottleState>()
    for (let i = 0; i < MAX_TRACKED; i++) decide(seen, `k${i}`, T0 + i)
    expect(seen.size).toBe(MAX_TRACKED)
    expect(decide(seen, 'brand new', T0 + MAX_TRACKED).send).toBe(true)
    expect(seen.size).toBeLessThanOrEqual(MAX_TRACKED)
    // and the newcomer is really tracked, i.e. its repeat is held back
    expect(decide(seen, 'brand new', T0 + MAX_TRACKED + 1).send).toBe(false)
  })

  it('bot.catch delivers one event ONCE, not once per channel', () => {
    // The catch-all branch logged at error AND called the service directly.
    // logger.error already reaches the owner through the transport, so the
    // direct call was a second copy of one event -- and the copy bypassed the
    // throttle entirely, which is the shape that makes a shared broken
    // dependency page once per failing update.
    const code = codeOf('src/helpers/error/errorHandler.ts')
    const direct = (
      code.match(/telegramLogService\s*\n?\s*\.logError\(/g) || []
    ).length
    expect(direct, 'a delivery path that skips the throttle came back').toBe(0)
  })

  it('a 403 that is not "the user blocked us" reaches the owner at all', () => {
    // This branch wrote a warn for the file and called the service directly for
    // the owner. Removing the direct call would have silenced it completely,
    // because warn is not forwarded -- so the level had to move with it. A
    // mutant that put `warn` back survived until this test existed.
    const code = codeOf('src/helpers/error/errorHandler.ts')
    // My own site, written this morning with the guard AFTER the slice. Same
    // helper as everywhere else now: the anchor names itself when it goes.
    const branch = sliceBetween(
      code,
      '} else if (isForbiddenError) {',
      '} else {'
    )
    expect(branch, 'a 403 is logged where the owner will never see it').toMatch(
      /logger\.error\('🔒/
    )
    expect(branch).not.toMatch(/logger\.warn\('🔒/)
  })

  it('an unhandled rejection carries WHAT failed in its message', () => {
    // Deduplication is by message text. A constant message collapses every
    // rejection in the process into one incident, so the second distinct
    // failure is never seen.
    const code = codeOf('src/helpers/error/errorHandler.ts')
    expect(code).toMatch(/Unhandled promise rejection: \$\{why/)
    expect(fingerprint('Unhandled promise rejection: fetch failed')).not.toBe(
      fingerprint('Unhandled promise rejection: pool is closed')
    )
  })

  it('the transport actually asks before sending', () => {
    // A perfect throttle nobody calls suppresses nothing -- the same shape as
    // the extractor over a discarded stream that cost a day (#2225).
    const code = codeOf('src/utils/logger.ts')
    expect(code).toMatch(/decide\(\s*this\.seen/)
    expect(code).toMatch(/if \(!verdict\.send\)/)
    expect(code).toMatch(/withSuppressedCount\(/)
  })
})
