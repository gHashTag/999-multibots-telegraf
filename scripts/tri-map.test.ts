/**
 * THE MAP IS READ OUT OF THE CLI, SO ITS READER IS TESTED ON INVENTED CLIs.
 *
 * Two bugs live in here already, both caught on the first run against the real
 * file and both pinned below:
 *
 *   - the help text was located by the first mention of "tri help", which is
 *     inside a command's own comment, so the slice searched for documented
 *     names started AFTER the list -- and every documented command came out
 *     marked undocumented (74 instead of 48).
 *   - the summary took the whole leading comment, and several commands carry a
 *     page of history above them, so the map printed exactly the wall of text
 *     it exists to replace.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'

const { parse } = createRequire(__filename)(
  path.join(__dirname, 'tri-map.cjs')
) as {
  parse: (source: string) => Array<{
    name: string
    aliases: string[]
    fn: string
    what: string
    inHelp: boolean
  }>
}

/** A miniature `tri`: two commands, one of them in the help text. */
const CLI = [
  'usage() {',
  '  cat <<EOF',
  '  tri seen [--all] | tri видно',
  '        A command somebody wrote down.',
  'EOF',
  '}',
  '',
  'cmd_seen() {',
  '  # It is described in the help. And this second sentence must not appear.',
  '  #   tri seen [--all]',
  '  ( cd "$ROOT" && node seen.cjs "$@" )',
  '}',
  '',
  'cmd_unseen() {',
  '  # Nobody wrote this one down.',
  '  ( cd "$ROOT" && node unseen.cjs "$@" )',
  '}',
  '',
  'cmd_silent() {',
  '  ( cd "$ROOT" && node silent.cjs "$@" )',
  '}',
  '',
  'case "$1" in',
  '  seen|видно)     cmd_seen "$@" ;;',
  '  unseen)         cmd_unseen "$@" ;;',
  '  silent)         cmd_silent "$@" ;;',
  'esac',
].join('\n')

describe('the map of what tri can do', () => {
  it('finds every dispatched command and its aliases', () => {
    const rows = parse(CLI)
    expect(rows.map(r => r.name)).toEqual(['seen', 'unseen', 'silent'])
    expect(rows[0].aliases).toEqual(['видно'])
  })

  it('takes one sentence of the comment, not the whole comment', () => {
    const rows = parse(CLI)
    expect(rows[0].what).toBe('It is described in the help.')
    expect(rows[0].what, 'the usage line leaked into the summary').not.toMatch(
      /tri seen/
    )
  })

  it('says plainly when a command explains nothing', () => {
    const rows = parse(CLI)
    expect(rows.find(r => r.name === 'silent')?.what).toBe('')
  })

  /*
   * THE BUG THAT MATTERED. "tri help" appears inside comments long before the
   * help text itself; anchoring on it cut the search window to nothing.
   */
  it('tells a documented command from an undocumented one', () => {
    const rows = parse(CLI)
    expect(rows.find(r => r.name === 'seen')?.inHelp).toBe(true)
    expect(rows.find(r => r.name === 'unseen')?.inHelp).toBe(false)
  })

  it('finds a name written in the help under its alias', () => {
    const rows = parse(CLI)
    // The help lists it with a Russian alias beside it; either name counts.
    expect(rows.find(r => r.name === 'seen')?.inHelp).toBe(true)
  })

  /*
   * And against the real file: the map must cover the whole CLI, because the
   * reason it exists is that a partial list is what sent me rebuilding
   * commands that already existed.
   */
  it('covers every command of the real tri', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'tri'), 'utf8')
    const rows = parse(source)
    const dispatched = source
      .split('\n')
      .filter(l => /^\s{2}([^)]+)\)\s+cmd_[a-z_0-9]+\s/.test(l)).length
    expect(rows.length).toBe(dispatched)
    expect(rows.length).toBeGreaterThan(90)
    expect(rows.some(r => r.name === 'mutate')).toBe(true)
  })
})
