/**
 * `tri iphone processed`: has Apple finished with the upload?
 *
 * `beta` uploads without waiting for processing, so this command is how the
 * owner and the loop learn the build reached the phone. Two halves:
 * build_wait.rb decides the verdict from App Store Connect's data (tested in
 * Ruby, no Apple), and tri turns the lane's verdict line into an exit code
 * (tested with fastlane stubbed through TRI_FASTLANE and the notification
 * through TRI_NOTIFY, so nothing here talks to Apple or pops a banner).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const TRI = path.join(__dirname, '..', 'tri')
const IOS_FASTLANE = path.join(__dirname, '..', 'apps', 'vibee-ios', 'fastlane')
const hasRuby = spawnSync('ruby', ['-v']).status === 0

let bin: string

/** Runs `tri iphone processed ...` with the lane printing `lane`. */
function processed(lane: string, ...args: string[]) {
  fs.writeFileSync(path.join(bin, 'lane-out'), lane)
  const r = spawnSync('bash', [TRI, 'iphone', 'processed', ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      NO_COLOR: '1',
      TRI_FASTLANE: path.join(bin, 'fastlane'),
      TRI_NOTIFY: path.join(bin, 'notify'),
      TMPDIR: bin,
    },
  })
  const read = (f: string) =>
    fs.existsSync(path.join(bin, f))
      ? fs.readFileSync(path.join(bin, f), 'utf8').trim()
      : ''
  return {
    rc: r.status,
    out: `${r.stdout}${r.stderr}`,
    call: read('call'),
    notified: read('notified'),
  }
}

beforeEach(() => {
  bin = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tri-proc-')))
  fs.writeFileSync(
    path.join(bin, 'fastlane'),
    // Records the lane and the two settings it was given, prints the canned
    // lane output, and fails like fastlane when that output is an error.
    `#!/bin/sh\necho "$1 wait=$PROCESSED_WAIT_MIN build=$PROCESSED_BUILD" > '${bin}/call'\ncat '${bin}/lane-out'\ngrep -q 'has no app' '${bin}/lane-out' && exit 1\nexit 0\n`,
    { mode: 0o755 }
  )
  fs.writeFileSync(
    path.join(bin, 'notify'),
    `#!/bin/sh\necho "$2" > '${bin}/notified'\n`,
    { mode: 0o755 }
  )
})

afterEach(() => fs.rmSync(bin, { recursive: true, force: true }))

describe('tri iphone processed (exit codes)', () => {
  it('ready is 0, names the build, asks no consent', () => {
    const r = processed('processed  ready  build 3 (1.0) VALID\n')
    expect(r.rc).toBe(0)
    expect(r.call).toBe('processed wait=0 build=')
    expect(r.out).toMatch(/in TestFlight: build 3 \(1\.0\) VALID/)
  })

  it('refused and expired are 1', () => {
    expect(processed('processed  failed  build 3 (1.0) INVALID\n').rc).toBe(1)
    expect(
      processed('processed  expired  build 2 (1.0) VALID expired\n').rc
    ).toBe(1)
  })

  it('still processing and nothing uploaded are 4, not 0 and not 1', () => {
    const p = processed('processed  processing  build 3 (1.0) PROCESSING\n')
    expect(p.rc).toBe(4)
    expect(p.out).toMatch(/--wait/)
    expect(processed('processed  none  no build uploaded yet\n').rc).toBe(4)
  })

  it('a lane that prints no verdict is 1, never a silent 0', () => {
    expect(processed('app       Trinity\n').rc).toBe(1)
  })

  it('a missing app record is 3, like tri iphone state', () => {
    expect(
      processed(
        'App Store Connect has no app with bundle id ai.t27.trinity: tri iphone state\n'
      ).rc
    ).toBe(3)
  })

  it('--wait and --build reach the lane; waiting notifies once on an answer', () => {
    const r = processed(
      'processed  ready  build 7 (1.0) VALID\n',
      '--wait',
      '45',
      '--build',
      '7'
    )
    expect(r.rc).toBe(0)
    expect(r.call).toBe('processed wait=45 build=7')
    expect(r.notified).toMatch(/display notification "ready: build 7/)
  })

  it('without --wait nobody is waiting, so no notification', () => {
    expect(processed('processed  ready  build 3 (1.0) VALID\n').notified).toBe(
      ''
    )
  })

  it('bad arguments are 2 and never reach fastlane', () => {
    for (const args of [
      ['--wait', 'soon'],
      ['--build', 'x'],
      ['--now'],
      ['--wait'],
    ]) {
      const r = processed('processed  ready  build 3 (1.0) VALID\n', ...args)
      expect(r.rc, args.join(' ')).toBe(2)
      expect(r.call, args.join(' ')).toBe('')
    }
  })
})

/** Calls a BuildWait method in Ruby with JSON arguments. */
function buildWait(expr: string, ...args: unknown[]): string {
  const r = spawnSync(
    'ruby',
    [
      '-r',
      'json',
      '-r',
      path.join(IOS_FASTLANE, 'build_wait.rb'),
      '-e',
      `a = ARGV.map { |x| JSON.parse(x, symbolize_names: true) }; puts(${expr})`,
      ...args.map(a => JSON.stringify(a)),
    ],
    { encoding: 'utf8', env: { ...process.env, LC_ALL: 'en_US.UTF-8' } }
  )
  expect(r.status, r.stderr).toBe(0)
  return r.stdout.trim()
}

describe.skipIf(!hasRuby)('build_wait.rb', () => {
  const BUILDS = [
    { version: '5', app_version: '1.0', state: 'PROCESSING', expired: false },
    { version: '4', app_version: '1.0', state: 'VALID', expired: false },
    { version: '3', app_version: '1.0', state: 'VALID', expired: true },
  ]

  it('maps every processing state, expired apart from ready', () => {
    const v = (s: string, e = false) =>
      buildWait('BuildWait.verdict(a[0], a[1])', s, e)
    expect(v('VALID')).toBe('ready')
    expect(v('VALID', true)).toBe('expired')
    expect(v('INVALID')).toBe('failed')
    expect(v('FAILED')).toBe('failed')
    expect(v('PROCESSING')).toBe('processing')
    expect(v('SOMETHING_NEW')).toBe('unknown')
  })

  it('picks the newest, or the build asked for, or nothing', () => {
    const pick = (want: string) =>
      buildWait(
        '(BuildWait.pick(a[0], a[1]) || {})[:version].inspect',
        BUILDS,
        want
      )
    expect(pick('')).toBe('"5"')
    expect(pick('4')).toBe('"4"')
    expect(pick('9')).toBe('nil')
  })

  it('the line starts with the verdict word that tri reads', () => {
    expect(buildWait('BuildWait.line(a[0], :ready)', BUILDS[1])).toBe(
      'processed  ready  build 4 (1.0) VALID'
    )
    expect(buildWait('BuildWait.line(nil, :none)')).toBe(
      'processed  none  no build uploaded yet'
    )
    expect(buildWait('BuildWait.line(nil, :none, a[0])', '9')).toBe(
      'processed  none  build 9 is not among the recent uploads'
    )
  })

  it('the lane is read-only and requires the module', () => {
    const fastfile = fs.readFileSync(
      path.join(IOS_FASTLANE, 'Fastfile'),
      'utf8'
    )
    expect(fastfile).toContain('require_relative "build_wait"')
    const lane = fastfile.slice(
      fastfile.indexOf('lane :processed do'),
      fastfile.indexOf('lane :certs do')
    )
    expect(lane).toContain('BuildWait.line(build, verdict, want)')
    expect(lane).not.toContain('VIBEE_UPLOAD_YES')
    expect(lane).not.toMatch(/\.(create|update|delete|post)_/)
  })
})
