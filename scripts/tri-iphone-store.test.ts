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

  it('metadata refuses without --yes and runs no lane at all', () => {
    const r = iphone('metadata')
    expect(r.rc).toBe(2)
    expect(r.out).toContain('metadata --yes')
    expect(r.lanes).toEqual([])
  })

  it('runs metadata, and only metadata, on --yes - with the consent', () => {
    const r = iphone('metadata', '--yes')
    expect(r.rc).toBe(0)
    expect(r.lanes).toEqual(['metadata+yes'])
  })

  it('an unknown mode refuses instead of building for the phone', () => {
    // `tri iphone testflight --yes` in a checkout older than the testflight
    // mode used to fall through to the device build and print "OK launched".
    const r = iphone('testflihgt', '--yes')
    expect(r.rc).toBe(2)
    expect(r.out).toContain("unknown mode 'testflihgt'")
    expect(r.out).toContain('testflight')
    expect(r.out).not.toContain('devicectl')
    expect(r.lanes).toEqual([])
  })

  it('every mode the header and the help name is dispatched or accepted', () => {
    // The refusal above must not swallow a documented word: the header said
    // `install` long before there was a branch for it (default path).
    const src = fs.readFileSync(TRI, 'utf8')
    const fn = src.slice(src.indexOf('cmd_iphone() {'))
    const body = fn.slice(0, fn.indexOf('\n}\n'))
    const known = new Set<string>([
      ...[...body.matchAll(/\[ "\$mode" = "([\w-]+)" \]/g)].map(m => m[1]),
      ...(body.match(/^\s*([\w|-]+)\) ;;$/m)?.[1].split('|') ?? []),
    ])
    const documented = [
      ...src.matchAll(/^#? *tri iphone \[([\w|-]+)\]/gm),
    ].flatMap(m => m[1].split('|'))
    // The header's one-line-per-mode table: `#   tri iphone sim   ...`.
    const perLine = [...src.matchAll(/^#\s+tri iphone ([a-z][\w-]*)/gm)].map(
      m => m[1]
    )
    // The refusal's own `modes:` list is typed by hand; it must not offer a
    // word the function would refuse, nor leave one out.
    const offered = (body.match(/modes: ([^"]+)"/)?.[1] ?? '')
      .replace('(default)', '')
      .split(/\s+/)
      .filter(Boolean)
    expect(documented.length).toBeGreaterThan(5)
    expect(perLine.length).toBeGreaterThan(5)
    expect(
      [...documented, ...perLine, ...offered].filter(m => !known.has(m))
    ).toEqual([])
    expect([...known].filter(m => !offered.includes(m))).toEqual([])
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

/**
 * THE STORE PAGE LIMITS ARE TESTED WHERE THEY ARE DEFINED.
 *
 * `preflight` and the `metadata` lane both ask apps/vibee-ios/fastlane/
 * store_metadata.rb; it is plain Ruby, so it runs here without fastlane and
 * without Apple. App Store Connect would report each overrun one field at a
 * time, after the request.
 */
const IOS_FASTLANE = path.join(__dirname, '..', 'apps', 'vibee-ios', 'fastlane')
const hasRuby = spawnSync('ruby', ['-v']).status === 0

function pageProblems(dir: string): string[] {
  const r = spawnSync(
    'ruby',
    [
      '-r',
      path.join(IOS_FASTLANE, 'store_metadata.rb'),
      '-e',
      'puts StoreMetadata.problems(ARGV[0])',
      dir,
    ],
    { encoding: 'utf8', env: { ...process.env, LC_ALL: 'en_US.UTF-8' } }
  )
  expect(r.status, r.stderr).toBe(0)
  return r.stdout.split('\n').filter(Boolean)
}

describe.skipIf(!hasRuby)('store page texts (store_metadata.rb)', () => {
  it('the texts in the repository are within every limit', () => {
    expect(pageProblems(path.join(IOS_FASTLANE, 'metadata'))).toEqual([])
  })

  it('names every problem at once: limit, missing field, url, keyword spaces', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-page-'))
    try {
      for (const locale of ['en-US', 'ru']) {
        const d = path.join(dir, locale)
        fs.mkdirSync(d)
        fs.writeFileSync(path.join(d, 'description.txt'), 'An app.\n')
        fs.writeFileSync(path.join(d, 'keywords.txt'), 'video,reels\n')
        fs.writeFileSync(path.join(d, 'support_url.txt'), 'https://t27.ai\n')
        fs.writeFileSync(
          path.join(d, 'privacy_url.txt'),
          'https://app.t27.ai/privacy-policy\n'
        )
      }
      expect(pageProblems(dir)).toEqual([])

      const en = path.join(dir, 'en-US')
      // 31 characters: one over. Counted as characters, so Cyrillic is not
      // charged double the way a byte count would.
      fs.writeFileSync(path.join(en, 'subtitle.txt'), 'x'.repeat(31))
      fs.writeFileSync(
        path.join(dir, 'ru', 'subtitle.txt'),
        '\u0416'.repeat(30)
      )
      fs.writeFileSync(path.join(en, 'keywords.txt'), 'video, reels')
      fs.writeFileSync(path.join(en, 'support_url.txt'), 'http://t27.ai')
      fs.rmSync(path.join(en, 'privacy_url.txt'))

      expect(pageProblems(dir)).toEqual([
        'en-US/privacy_url.txt is missing or empty',
        'en-US/subtitle.txt is 31 characters; the limit is 30',
        'en-US/support_url.txt is not an https URL: http://t27.ai',
        'en-US/keywords.txt has spaces after commas; they count against the limit',
      ])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a keyword made only of subtitle words is named: it buys nothing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-page-'))
    try {
      for (const locale of ['en-US', 'ru']) {
        const d = path.join(dir, locale)
        fs.mkdirSync(d)
        fs.writeFileSync(path.join(d, 'description.txt'), 'An app.')
        fs.writeFileSync(path.join(d, 'support_url.txt'), 'https://t27.ai')
        fs.writeFileSync(path.join(d, 'privacy_url.txt'), 'https://t27.ai/p')
        fs.writeFileSync(
          path.join(d, 'subtitle.txt'),
          'AI video, agents and reels'
        )
        fs.writeFileSync(
          path.join(d, 'keywords.txt'),
          'AI video,video editor,reels'
        )
      }
      // "video editor" stays: "editor" is not in the subtitle.
      expect(pageProblems(dir)).toEqual([
        'en-US/keywords.txt repeats the subtitle: AI video',
        'en-US/keywords.txt repeats the subtitle: reels',
        'ru/keywords.txt repeats the subtitle: AI video',
        'ru/keywords.txt repeats the subtitle: reels',
      ])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a locale with no folder is a problem, not a silent skip', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-page-'))
    try {
      expect(pageProblems(dir)).toEqual([
        `en-US: no metadata folder ${path.join(dir, 'en-US')}`,
        `ru: no metadata folder ${path.join(dir, 'ru')}`,
      ])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

/**
 * WHAT A TESTER READS IS ABOUT THE APP.
 *
 * The TestFlight notes were the last commit of the monorepo: on 2026-10-03
 * that was a CRM docs change, with the squash separator and the
 * Co-authored-by trailer under it. test_notes.rb takes the subjects of the
 * commits that touched apps/vibee-ios instead.
 */
function notes(code: string, ...args: string[]): string {
  const r = spawnSync(
    'ruby',
    ['-r', path.join(IOS_FASTLANE, 'test_notes.rb'), '-e', code, ...args],
    { encoding: 'utf8', env: { ...process.env, LC_ALL: 'en_US.UTF-8' } }
  )
  expect(r.status, r.stderr).toBe(0)
  return r.stdout
}

describe.skipIf(!hasRuby)('TestFlight notes (test_notes.rb)', () => {
  it('subjects, one per line - no merges, no repeats, no blanks', () => {
    expect(
      notes(
        'print TestNotes.from_subjects(ARGV)',
        'fix(ios): the mic asks once',
        'Merge pull request #1 from x/y',
        '',
        'fix(ios): the mic asks once',
        'feat(ios): voice picker'
      )
    ).toBe('- fix(ios): the mic asks once\n- feat(ios): voice picker')
  })

  it('stops at twelve lines and under the 4000-character limit', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => `change ${i}`)
    expect(
      notes('print TestNotes.from_subjects(ARGV)', ...twenty).split('\n')
    ).toHaveLength(12)
    // Whole lines only: a note cut mid-word reads as a bug.
    const long = Array.from({ length: 5 }, (_, i) => `${i}`.repeat(1500))
    const out = notes('print TestNotes.from_subjects(ARGV)', ...long)
    expect(out.length).toBeLessThanOrEqual(4000)
    expect(out.split('\n')).toEqual([
      `- ${'0'.repeat(1500)}`,
      `- ${'1'.repeat(1500)}`,
    ])
  })

  it('a hand-written CHANGELOG is cut to the limit in characters', () => {
    expect(
      notes('print TestNotes.cap(ARGV[0]).length', '\u0416'.repeat(4100))
    ).toBe('4000')
    expect(notes('print TestNotes.cap(nil).inspect')).toBe('""')
  })

  it('no git history is an empty note, not a crash after the archive', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-git-'))
    try {
      expect(notes('print TestNotes.collect(ARGV[0]).inspect', dir)).toBe('""')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('beta sends these notes, with a fallback, and names the internal group', () => {
    const fastfile = fs.readFileSync(
      path.join(IOS_FASTLANE, 'Fastfile'),
      'utf8'
    )
    expect(fastfile).toContain('require_relative "test_notes"')
    expect(fastfile).toContain('TestNotes.collect(IOS_DIR)')
    expect(fastfile).toContain('TestNotes.cap(ENV["CHANGELOG"]')
    expect(fastfile).not.toContain('last_git_commit')
    expect(fastfile).toMatch(/Internal Testing/)
  })
})
