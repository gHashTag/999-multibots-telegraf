/**
 * THE GATE THAT GUARDS EVERY COMMIT HAD NO TESTS.
 *
 * `scripts/no-cyrillic-guard.cjs` runs on every commit in this repository and
 * carries the subtlest logic of any gate here: it separates a comment from code
 * without a parser, strips string literals by hand in two dialects, and holds a
 * reflow exemption that decides when an added line is not really new. All of it
 * was unverified. A gate nobody can test is a gate whose behaviour is a rumour,
 * and this one cost a night of guessing on 2026-09-17.
 *
 * The unit tests below pin the hand-written scanners. The end-to-end block runs
 * the real script against a real git index in a throwaway repository, because
 * the part that misled me was not any single function -- it was which lines the
 * diff calls "added".
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const guard = require('./no-cyrillic-guard.cjs')
const GUARD = path.resolve(__dirname, 'no-cyrillic-guard.cjs')

describe('stripStrings', () => {
  it('removes Cyrillic that lived inside a quoted literal', () => {
    expect(guard.stripStrings("const a = 'привет'", false)).not.toMatch(
      /[\u0400-\u04FF]/
    )
    expect(guard.stripStrings('const a = "привет"', false)).not.toMatch(
      /[\u0400-\u04FF]/
    )
    expect(guard.stripStrings('const a = `привет`', false)).not.toMatch(
      /[\u0400-\u04FF]/
    )
  })

  it('leaves Cyrillic that sat outside every literal', () => {
    expect(guard.stripStrings("const слово = 'hi'", false)).toMatch(
      /[\u0400-\u04FF]/
    )
  })

  /*
   * The Swift hole, kept honest: Swift has no single-quoted string, so an
   * apostrophe must not open one. Treating it as a quote would swallow the rest
   * of the line and hide whatever followed -- a guard that goes quiet.
   */
  it('does not let an apostrophe swallow a Swift line', () => {
    const line = "// don't do это"
    expect(guard.stripStrings(line, true)).toMatch(/[\u0400-\u04FF]/)
  })
})

describe('lineCommentStart', () => {
  it('ignores the slashes inside a URL literal', () => {
    expect(guard.lineCommentStart("const u = 'http://x.dev'", false)).toBe(-1)
  })

  it('finds a comment that follows a closed literal', () => {
    const line = "const u = 'x' // note"
    expect(guard.lineCommentStart(line, false)).toBe(line.indexOf('//'))
  })
})

describe('cyrillicOutsideStrings', () => {
  it('allows bilingual UI text', () => {
    expect(
      guard.cyrillicOutsideStrings(
        "await ctx.reply(isRu ? 'Привет' : 'Hi')",
        false
      )
    ).toBe(false)
  })

  it('blocks a Russian comment', () => {
    expect(guard.cyrillicOutsideStrings('// почему так', false)).toBe(true)
  })

  /*
   * A quoted Russian word inside a COMMENT is still a comment. This is why the
   * comment is split off before the literals are stripped.
   */
  it('blocks a Russian word quoted inside a comment', () => {
    expect(guard.cyrillicOutsideStrings("// see 'почему'", false)).toBe(true)
  })

  it('blocks a Cyrillic identifier', () => {
    expect(guard.cyrillicOutsideStrings('function запрос(a) {', false)).toBe(
      true
    )
  })
})

describe('isReflowOfExistingCyrillic', () => {
  it('exempts a line whose every Cyrillic run the commit also removes', () => {
    const removed = "  запрос('/a', {}, {})\n"
    expect(guard.isReflowOfExistingCyrillic('  запрос(', removed)).toBe(true)
  })

  it('does not exempt a line that brings one new run', () => {
    const removed = "  запрос('/a')\n"
    expect(guard.isReflowOfExistingCyrillic('  запрос(ответ())', removed)).toBe(
      false
    )
  })

  it('never exempts a pure insertion, which removes nothing', () => {
    expect(guard.isReflowOfExistingCyrillic('// почему', '')).toBe(false)
  })
})

/*
 * END TO END, AGAINST A REAL INDEX.
 *
 * Every case below is a real `git add` in a throwaway repository followed by the
 * real script, because the unit above cannot answer the question that actually
 * bit: which lines does the staged diff call added?
 */
describe('the staged check against a real git index', () => {
  let dir: string

  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8' })

  /** Exit code of the guard's staged mode: 0 clean, 1 a hit. */
  const run = (): number => {
    try {
      execFileSync('node', [GUARD, 'staged'], {
        cwd: dir,
        encoding: 'utf8',
        stdio: 'pipe',
      })
      return 0
    } catch (err: any) {
      return err.status
    }
  }

  const write = (name: string, body: string) =>
    fs.writeFileSync(path.join(dir, name), body)

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyr-guard-'))
    git('init', '-q')
    git('config', 'user.email', 't@t.t')
    git('config', 'user.name', 'T')
    write('a.ts', "export const greet = () => 'Привет'\n")
    git('add', 'a.ts')
    git('commit', '-qm', 'base')
  })

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('passes a commit that adds only bilingual UI text', () => {
    write(
      'a.ts',
      "export const greet = () => 'Привет'\nexport const bye = () => 'Пока'\n"
    )
    git('add', 'a.ts')
    expect(run()).toBe(0)
  })

  it('blocks a commit that adds a Russian comment', () => {
    write('a.ts', "// почему так\nexport const greet = () => 'Привет'\n")
    git('add', 'a.ts')
    expect(run()).toBe(1)
  })

  it('accepts the marker on the offending line', () => {
    write(
      'a.ts',
      "// почему так cyrillic-ok\nexport const greet = () => 'Привет'\n"
    )
    git('add', 'a.ts')
    expect(run()).toBe(0)
  })

  /*
   * THE TRAP THIS BRANCH EXISTS FOR.
   *
   * A Cyrillic-named helper called across several lines cannot carry a marker on
   * the call line: prettier moves a comment written after `(` down onto its own
   * line, and the line left behind is a changed line with unmarked Cyrillic on
   * it. The marker does not merely fail there -- writing it CREATES the
   * violation, and writing it twice duplicates the comment. Measured on
   * pairing-e2e.test.ts, 2026-09-17: five attempts, each one reintroducing the
   * same complaint.
   *
   * So a marker on the line immediately next to the complaint, inside the same
   * hunk, counts. That is exactly the shape a formatter's move produces.
   */
  it('accepts a marker the formatter pushed onto the next line', () => {
    write(
      'a.ts',
      [
        'export const greet = () =>',
        '  запрос(',
        '    // cyrillic-ok: the helper of this file predates the gate',
        "    'Привет'",
        '  )',
        '',
      ].join('\n')
    )
    git('add', 'a.ts')
    expect(run()).toBe(0)
  })

  /*
   * THE GATE USED TO TRUNCATE ITS OWN EVIDENCE.
   *
   * `process.exit` discards writes still queued on a pipe, and stderr is a pipe
   * under lefthook and under anything that reads this output. Measured
   * 2026-09-17 on a branch with 8484 complaints: three consecutive runs of the
   * same script on the same commit printed 966, 7706 and 8484 lines. The verdict
   * was never wrong; the evidence was a lottery, and `tri gate` prints the first
   * five of it.
   *
   * A reader that keeps up hides the bug -- the first version of this test
   * passed against the broken script, which is the definition of a test that
   * cannot fail. So this one does NOT read for a moment: the 64K pipe buffer
   * fills, the writes queue, and the difference shows. Against the script as it
   * was, this prints 0 of 4000 lines.
   */
  it('prints every complaint even when the reader is slow', async () => {
    const many = Array.from(
      { length: 4000 },
      (_, i) => `// строка достаточно длинная чтобы набрать байты ${i}`
    )
    write('a.ts', many.join('\n') + '\n')
    git('add', 'a.ts')

    const printed = await new Promise<number>(resolve => {
      const child = spawn('node', [GUARD, 'staged'], {
        cwd: dir,
        stdio: ['ignore', 'ignore', 'pipe'],
      })
      let out = ''
      setTimeout(() => child.stderr.on('data', d => (out += d)), 400)
      child.on('close', () =>
        setTimeout(
          () =>
            resolve(out.split('\n').filter(l => l.includes('a.ts:')).length),
          400
        )
      )
    })

    expect(printed).toBe(4000)
  }, 20_000)

  /*
   * THE DIRECTIONAL FORM, WHICH EVERY OTHER LINTER HAS.
   *
   * `eslint-disable-next-line` exists because a trailing comment has nowhere to
   * go on plenty of lines. JSX children are the clearest case here: they take no
   * `//` comment at all, and one file in the player is unmodifiable for exactly
   * that reason.
   */
  it('accepts an explicit next-line directive above the line', () => {
    write(
      'a.ts',
      [
        '// cyrillic-ok-next-line: the key is read by three other files',
        "export const t = { причина: 'no answer' }",
        '',
      ].join('\n')
    )
    git('add', 'a.ts')
    expect(run()).toBe(0)
  })

  it('does not let a next-line directive reach two lines down', () => {
    write(
      'a.ts',
      [
        '// cyrillic-ok-next-line: covers the line directly below and no other',
        'const a = 1',
        "export const t = { причина: 'no answer' }",
        '',
      ].join('\n')
    )
    git('add', 'a.ts')
    expect(run()).toBe(1)
  })

  /*
   * HOW NARROW THE EXEMPTION IS, PINNED.
   *
   * The first version of the rule accepted a marker on either neighbouring
   * line. Across all 1107 branches in this repository that turned four from
   * blocked to clean, and every one was an accident: these two shapes, each
   * sitting next to a marker written for something else. A neighbour's marker
   * is not consent.
   */
  it('does not let a neighbouring marker cover Cyrillic in a regex literal', () => {
    write(
      'a.ts',
      [
        'export const n = (md: string) => {',
        '  // cyrillic-ok: this marker belongs to the line it sits on',
        '  for (const m of md.matchAll(/план (\\d+)/gu)) return m',
        '}',
        '',
      ].join('\n')
    )
    git('add', 'a.ts')
    expect(run()).toBe(1)
  })

  it('does not let a neighbouring marker cover a Cyrillic object key', () => {
    write(
      'a.ts',
      [
        'export const t = {',
        '  // cyrillic-ok: this marker belongs to the line it sits on',
        "  причина: 'no answer',",
        '}',
        '',
      ].join('\n')
    )
    git('add', 'a.ts')
    expect(run()).toBe(1)
  })

  it('still blocks unmarked Cyrillic two lines away from a marker', () => {
    write(
      'a.ts',
      [
        '// cyrillic-ok: this marker is for the line it sits on',
        'const a = 1',
        '// почему так',
        "export const greet = () => 'Привет'",
        '',
      ].join('\n')
    )
    git('add', 'a.ts')
    expect(run()).toBe(1)
  })
})
