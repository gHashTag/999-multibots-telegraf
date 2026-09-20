/**
 * THE ONE PLACE THAT KNOWS THIS IS A REAL SERVER.
 *
 * `routes.ts` and `pod-driver.ts` take everything they need as arguments, so
 * they can be tested without a container runtime, a database or a clock. This
 * file is where that ends: it reaches for the process environment, the shell
 * and the system's randomness, and it exists so `render-server.ts` gains nine
 * lines instead of a subsystem.
 */

import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { driverFromEnv, type Exec, type PodDriver } from './pod-driver'

/**
 * A pod start is a container start: seconds, not milliseconds (measured 9.5 s
 * for the viewer to answer). The timeout is generous for that and still
 * finite, because a hung driver call would otherwise hold a request open
 * forever and the person would see a spinner with no end.
 */
const run: Exec = (file, args) =>
  new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 120_000 }, (err, stdout) => {
      if (err) reject(err)
      else resolve({ stdout: String(stdout) })
    })
  })

let cached: PodDriver | null | undefined

/** Built once: the choice comes from configuration and cannot change at runtime. */
export function podDriver(): PodDriver | null {
  if (cached === undefined) cached = driverFromEnv(process.env, run)
  return cached
}

/** Test seam, and the only way to pick up a changed environment. */
export function resetPodDriver(): void {
  cached = undefined
}

/**
 * 24 random bytes, base64url. This value is both a name and a key: whoever
 * holds a session's view token can watch that browser, so it has to be
 * unguessable rather than merely unique, which rules out counters and
 * timestamps.
 */
export function newSessionToken(): string {
  return randomBytes(24).toString('base64url')
}
