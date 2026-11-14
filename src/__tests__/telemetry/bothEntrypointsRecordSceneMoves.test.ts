/**
 * SCENE-MOVE TELEMETRY WAS BUILT COMPLETE AND NEVER RAN.
 *
 * On 2026-09-20 the whole pipeline shipped: the middleware
 * (core/telemetry/telemetryMiddleware.ts), the client_events table, the
 * 07:00 UTC daily report (clientTelemetryDaily) that answers the owner's
 * "where do people get stuck". On 2026-10-12 the table was still empty --
 * 0 rows ever -- because the only file that registered the middleware was
 * src/bot.ts, and bot.ts is a PARITY file: "This file is not what Railway
 * starts". The real entrypoint, src/index.ts, registered session and
 * language and stopped. Every scene move every customer made for three
 * weeks was lost, and the daily report had nothing to count.
 *
 * The behavioral tests that hold bot.ts and index.ts in parity could not
 * see this: none of them pins WHICH middleware each file registers. This
 * file does the one thing they don't -- it reads both entrypoints as text
 * and requires the registration in each, so a fix here can never quietly
 * drift back into the parity file alone.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const REPO = path.resolve(__dirname, '..', '..', '..')
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8')

/** The exact registration line; an import alone records nothing. */
const REGISTRATION = 'bot.use(createClientTelemetryMiddleware())'

describe('every entrypoint that launches a bot records scene moves', () => {
  it('src/index.ts -- the file Railway actually starts -- registers the telemetry middleware', () => {
    expect(
      read('src/index.ts'),
      'the daily client report is empty columns in the Postgres of record ' +
        'without this: 0 rows from 2026-09-20 to 2026-10-12 was this exact gap'
    ).toContain(REGISTRATION)
  })

  it('src/bot.ts -- the parity file, both its dev and farm paths -- still registers it', () => {
    const src = read('src/bot.ts')
    expect(src).toContain(REGISTRATION)
    // The farm loop (production path inside bot.ts) registers it too, and a
    // registration count proves the file did not lose one of its two paths.
    expect(
      src.split(REGISTRATION).length - 1,
      'bot.ts registers the middleware once per launch path: dev and farm'
    ).toBeGreaterThanOrEqual(2)
  })
})
