/**
 * `tri iphone testflight` UPLOADS ONLY ON AN EXPLICIT --yes.
 *
 * The upload publishes a build under the owner's App Store Connect account.
 * A loop that types `tri iphone testflight` by habit must get a refusal, not
 * a TestFlight build; `store` must stay read-only (preflight, then state).
 * fastlane is replaced (TRI_FASTLANE - tri puts Homebrew first on PATH, so a
 * PATH stub would lose to the real one) by a stub that records the lanes it
 * was asked for, so nothing here talks to Apple.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const TRI = path.join(__dirname, '..', 'tri')

let bin: string
let calls: string

function iphone(...args: string[]) {
  const r = spawnSync('bash', [TRI, 'iphone', ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      NO_COLOR: '1',
      TRI_FASTLANE: path.join(bin, 'fastlane'),
      TMPDIR: bin,
    },
  })
  const lanes = fs.existsSync(calls)
    ? fs.readFileSync(calls, 'utf8').trim().split('\n')
    : []
  return { rc: r.status, out: `${r.stdout}${r.stderr}`, lanes }
}

beforeEach(() => {
  bin = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tri-store-')))
  calls = path.join(bin, 'calls')
  fs.writeFileSync(
    path.join(bin, 'fastlane'),
    // A lane that got the upload consent is recorded as `lane+yes`.
    `#!/bin/sh\nl="$1"; [ "$VIBEE_UPLOAD_YES" = 1 ] && l="$1+yes"\necho "$l" >> '${calls}'\necho "  ✓ stub $1"\n`,
    { mode: 0o755 }
  )
})

afterEach(() => fs.rmSync(bin, { recursive: true, force: true }))

describe('tri iphone store / testflight', () => {
  it('refuses to upload without --yes and runs no lane at all', () => {
    const r = iphone('testflight')
    expect(r.rc).toBe(2)
    expect(r.out).toContain('testflight --yes')
    expect(r.lanes).toEqual([])
  })

  it('runs beta, and only beta, on --yes - and hands it the consent', () => {
    const r = iphone('testflight', '--yes')
    expect(r.rc).toBe(0)
    expect(r.lanes).toEqual(['beta+yes'])
  })

  it('store is preflight then state - never an upload lane', () => {
    const r = iphone('store')
    expect(r.rc).toBe(0)
    expect(r.lanes).toEqual(['preflight', 'state'])
    expect(r.out).toContain('✓ stub state')
  })

  it('a consent left in the caller env never reaches the read-only lanes', () => {
    process.env.VIBEE_UPLOAD_YES = '1'
    try {
      expect(iphone('store').lanes).toEqual(['preflight', 'state'])
    } finally {
      delete process.env.VIBEE_UPLOAD_YES
    }
  })

  it('stops at the first failing lane and says which', () => {
    fs.writeFileSync(
      path.join(bin, 'fastlane'),
      `#!/bin/sh\necho "$1" >> '${calls}'\nexit 1\n`,
      { mode: 0o755 }
    )
    const r = iphone('store')
    expect(r.rc).toBe(1)
    expect(r.lanes).toEqual(['preflight'])
    expect(r.out).toContain('fastlane preflight failed')
  })
})
