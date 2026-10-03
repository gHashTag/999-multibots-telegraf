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
/** Per-test changes to the environment tri runs in. */
let env: Record<string, string> = {}

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
      TRI_CURL: path.join(bin, 'curl'),
      TRI_TG_TOKEN: '123:test-token',
      TRI_TG_CHAT: '42',
      TRI_PROCESSED_SENT: path.join(bin, 'sent'),
      TMPDIR: bin,
      // A railway that only records being asked: no test may read Railway.
      // PATH alone is not enough -- tri puts /opt/homebrew/bin and its picked
      // railway in front -- so the pick's own cache names the stub.
      XDG_CACHE_HOME: bin,
      RVARS_PAUSE: '0',
      ...env,
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
    notifyArgs: read('notify-args'),
    curlArgs: read('curl-args'),
    curlConfig: read('curl-config'),
    railway: read('railway-called'),
  }
}

beforeEach(() => {
  env = {}
  bin = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tri-proc-')))
  fs.writeFileSync(
    path.join(bin, 'railway'),
    `#!/bin/sh\necho "$*" >> '${bin}/railway-called'\nexit 1\n`,
    { mode: 0o755 }
  )
  fs.mkdirSync(path.join(bin, 'tri'))
  fs.writeFileSync(
    path.join(bin, 'tri', 'railway-bin'),
    path.join(bin, 'railway')
  )
  fs.writeFileSync(
    path.join(bin, 'fastlane'),
    // Records the lane and the two settings it was given, prints the canned
    // lane output, and fails like fastlane when that output is an error.
    `#!/bin/sh\necho "$1 wait=$PROCESSED_WAIT_MIN build=$PROCESSED_BUILD" > '${bin}/call'\ncat '${bin}/lane-out'\ngrep -q 'has no app' '${bin}/lane-out' && exit 1\nexit 0\n`,
    { mode: 0o755 }
  )
  fs.writeFileSync(
    path.join(bin, 'notify'),
    // The last argument is the banner text; every argument is kept so a
    // test can see the text never lands inside the AppleScript itself.
    `#!/bin/sh\nprintf '%s\\n' "$@" > '${bin}/notify-args'\nfor a; do last="$a"; done\necho "$last" > '${bin}/notified'\n`,
    { mode: 0o755 }
  )
  fs.writeFileSync(
    path.join(bin, 'curl'),
    // Keeps argv and the config it reads on stdin apart, so a test can see
    // the token travels only on stdin; answers like the Bot API (or like a
    // refusal when told to).
    `#!/bin/sh\nprintf '%s\\n' "$@" >> '${bin}/curl-args'\ncat >> '${bin}/curl-config'\nif [ -f '${bin}/curl-fails' ]; then echo '{"ok":false,"description":"Forbidden"}'; else echo '{"ok":true}'; fi\n`,
    { mode: 0o755 }
  )
})

afterEach(() => fs.rmSync(bin, { recursive: true, force: true }))

describe('tri iphone processed --telegram', () => {
  const READY = 'processed  ready  build 7 (1.0) VALID\n'

  it('a final answer reaches the owner once, the token only on stdin', () => {
    const r = processed(READY, '--telegram')
    expect(r.rc).toBe(0)
    expect(r.curlConfig).toBe(
      'url = "https://api.telegram.org/bot123:test-token/sendMessage"'
    )
    expect(r.curlArgs).not.toContain('test-token')
    expect(r.curlArgs).toContain('chat_id=42')
    expect(r.curlArgs).toContain('build 7 (1.0) VALID')
    expect(r.out).toMatch(/the owner has the answer/)
    const again = processed(READY, '--telegram')
    expect(again.rc).toBe(0)
    expect(again.curlArgs.split('chat_id=42').length - 1).toBe(1)
    expect(again.out).toMatch(/already reached the owner/)
  })

  it('a new answer after a sent one goes out too', () => {
    processed(READY, '--telegram')
    const r = processed(
      'processed  failed  build 8 (1.0) INVALID\n',
      '--telegram'
    )
    expect(r.rc).toBe(1)
    expect(r.curlArgs).toContain('build 8 (1.0) INVALID')
  })

  it('still processing and nothing uploaded send nothing', () => {
    for (const lane of [
      'processed  processing  build 8 (1.0) PROCESSING\n',
      'processed  none  no build uploaded yet\n',
    ]) {
      const r = processed(lane, '--telegram')
      expect(r.rc, lane).toBe(4)
      expect(r.curlArgs, lane).toBe('')
    }
  })

  it('without --telegram nothing is sent', () => {
    expect(processed(READY, '--wait', '1').curlArgs).toBe('')
  })

  it('a refused send warns, keeps the exit code, and is retried next time', () => {
    fs.writeFileSync(path.join(bin, 'curl-fails'), '')
    const r = processed(READY, '--telegram')
    expect(r.rc).toBe(0)
    expect(r.out).toMatch(/not sent .*Forbidden/)
    fs.rmSync(path.join(bin, 'curl-fails'))
    const again = processed(READY, '--telegram')
    expect(again.out).toMatch(/the owner has the answer/)
  })

  it('a stubbed curl never makes tri read the real token from Railway', () => {
    env = { TRI_TG_TOKEN: '' }
    const r = processed(READY, '--telegram')
    expect(r.rc).toBe(0)
    expect(r.railway).toBe('')
    expect(r.curlArgs).toBe('')
    expect(r.out).toMatch(/TRI_CURL is a stub/)
  })

  it('a token outside the bot-token alphabet never reaches the curl config', () => {
    for (const tok of [
      '123:abc\noutput = /tmp/x',
      '123:a"b',
      '123:a b',
      '123:',
      ':abc',
      'abc',
    ]) {
      env = { TRI_TG_TOKEN: tok }
      const r = processed(READY, '--telegram')
      expect(r.rc, tok).toBe(0)
      expect(r.curlConfig, tok).toBe('')
      expect(r.out, tok).toMatch(/right shape/)
    }
  })

  it('a sent answer that cannot be recorded says it will be sent again', () => {
    // The parent of the record is a file, so the record cannot be written.
    env = { TRI_PROCESSED_SENT: path.join(bin, 'curl', 'sent') }
    const r = processed(READY, '--telegram')
    expect(r.rc).toBe(0)
    expect(r.curlArgs).toContain('chat_id=42')
    expect(r.out).toMatch(/cannot be written -- the next run sends it again/)
    expect(r.out).not.toMatch(/the owner has the answer/)
  })
})

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
    expect(r.notified).toBe('ready: build 7 (1.0) VALID')
  })

  it('a --wait that runs out while processing still notifies, and is 4', () => {
    const r = processed(
      'processed  processing  build 8 (1.0) PROCESSING\n',
      '--wait',
      '1'
    )
    expect(r.rc).toBe(4)
    expect(r.notified).toBe('processing: build 8 (1.0) PROCESSING')
  })

  it("a state tri does not know is named, not 'no verdict'", () => {
    const r = processed('processed  unknown  build 9 (1.0) SOMETHING_NEW\n')
    expect(r.rc).toBe(1)
    expect(r.out).toMatch(/does not know: build 9 \(1\.0\) SOMETHING_NEW/)
    expect(r.out).not.toMatch(/no verdict/)
  })

  it("a quote in Apple's reply stays an argument, outside the AppleScript", () => {
    const r = processed(
      'processed  unknown  build 9 (1.0) A"B\\C\n',
      '--wait',
      '1'
    )
    expect(r.notified).toBe('unknown: build 9 (1.0) A"B\\C')
    const script = r.notifyArgs.split('\n').slice(0, -1).join('\n')
    expect(script).toContain('item 1 of argv')
    expect(script).not.toContain('A"B')
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

  it('keeps waiting on PROCESSING, and on an unlisted upload it knows of', () => {
    const w = (v: string, want: string) =>
      buildWait('BuildWait.keep_waiting?(a[0].to_sym, a[1])', v, want)
    expect(w('processing', '')).toBe('true')
    expect(w('none', '12')).toBe('true')
    expect(w('none', '')).toBe('false')
    expect(w('ready', '12')).toBe('false')
    expect(w('failed', '12')).toBe('false')
    expect(w('unknown', '12')).toBe('false')
  })

  it('reads the recorded upload number, nil when absent or garbage', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-'))
    try {
      const f = path.join(dir, 'last-upload')
      const rec = () => buildWait('BuildWait.recorded(a[0]).inspect', f)
      expect(rec()).toBe('nil')
      fs.writeFileSync(f, '8120\n')
      expect(rec()).toBe('"8120"')
      fs.writeFileSync(f, 'oops')
      expect(rec()).toBe('nil')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('beta records the number it uploaded, after the upload', () => {
    const fastfile = fs.readFileSync(
      path.join(IOS_FASTLANE, 'Fastfile'),
      'utf8'
    )
    const beta = fastfile.slice(fastfile.indexOf('lane :beta do'))
    const upload = beta.indexOf('upload_to_testflight(')
    const record = beta.indexOf('build/last-upload')
    expect(upload).toBeGreaterThan(0)
    expect(record).toBeGreaterThan(upload)
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
    expect(lane).toContain('BuildWait.keep_waiting?(verdict, want)')
    expect(lane).toContain('BuildWait.recorded(')
    expect(lane).not.toContain('VIBEE_UPLOAD_YES')
    expect(lane).not.toMatch(/\.(create|update|delete|post)_/)
  })
})
