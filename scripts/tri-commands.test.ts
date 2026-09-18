/**
 * A NEW COMMAND NAME THAT IS ALREADY TAKEN IS SHADOWED IN SILENCE.
 *
 * `tri` dispatches with a shell `case`, and a `case` takes the FIRST pattern
 * that matches. On 2026-09-18 a new `sweep|часы)` was added above the existing
 * `sweep|развёртка)`; nothing warned, the new branch simply never ran, and the
 * command shipped unreachable. It was caught by running it -- which only works
 * for the one command you happen to try.
 *
 * So: every dispatch name is unique, and every command a person can type
 * actually resolves to a function that exists.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const TRI = path.join(__dirname, '..', 'tri')
const source = fs.readFileSync(TRI, 'utf8')

/**
 * Every `name|alias)  cmd_x "$@" ;;` line of the dispatch, as {names, fn}.
 * Anchored on the call, so ordinary `case` blocks elsewhere in the file (and
 * there are several) cannot be mistaken for the command table.
 */
function dispatch() {
  const rows: Array<{ names: string[]; fn: string; line: number }> = []
  source.split('\n').forEach((text, i) => {
    const m = /^\s{2}([^)]+)\)\s+(cmd_[a-z_0-9]+)\s/.exec(text)
    if (!m) return
    rows.push({
      names: m[1].split('|').map(s => s.trim()),
      fn: m[2],
      line: i + 1,
    })
  })
  return rows
}

describe('the tri command table', () => {
  it('has a command table to check at all', () => {
    // An empty parse is the "checker that looked at nothing" failure.
    expect(dispatch().length).toBeGreaterThan(20)
  })

  /*
   * THE INCIDENT. A `case` takes the first match, so the second owner of a
   * name gets nothing -- no error, no warning, an unreachable command.
   */
  it('gives every name exactly one owner', () => {
    const owners = new Map<string, string[]>()
    for (const row of dispatch()) {
      for (const name of row.names) {
        owners.set(name, [...(owners.get(name) ?? []), `${row.fn}:${row.line}`])
      }
    }
    const shadowed = [...owners].filter(([, who]) => who.length > 1)
    expect(
      shadowed.map(([name, who]) => `${name} -> ${who.join(', ')}`),
      'a name is claimed twice; the second one can never run'
    ).toEqual([])
  })

  it('points every name at a function that exists', () => {
    const missing = dispatch()
      // `cmd_x () {` with a space is the same declaration, and one command
      // is written that way. The first version of this test reported it as a
      // missing function -- my checker was wrong, not the code.
      .filter(row => !new RegExp(`\\n${row.fn}\\s*\\(\\) \\{`).test(source))
      .map(row => `${row.names[0]} -> ${row.fn}`)
    expect(missing, 'the dispatch calls a function nothing defines').toEqual([])
  })

  /*
   * NOT CHECKED HERE: that every command appears in `tri help`. Sixty-six do
   * not, and a test that fails from its first day is a test somebody disables
   * -- which would take the two checks above down with it. The undocumented
   * ones are a debt to pay in daylight, not a gate to trip over at midnight.
   */
})
