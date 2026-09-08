import { describe, it, expect } from 'vitest'

/*
 * A TOOL THAT REPORTS AN ERROR IS NOT A TOOL THAT IS ONE.
 *
 * The first run of the toolkit sweep called `tri status` broken. It is not:
 * it prints a JSON report which CONTAINS "no such file or directory", as data,
 * describing a file it looked for and did not find, and it exits 0. The
 * classifier matched the phrase and never asked the exit code.
 *
 * That is the same shape as a gate reading a quoted warning as a violation --
 * the check described its input instead of its subject. Requiring BOTH a
 * failing exit and a failing message separates the two, and both halves are
 * pinned here because either alone lets one of the cases through.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  classify,
  subcommands,
  SKIP,
} = require('../../../scripts/tri-liveness.cjs')

describe('reporting an error is not being one', () => {
  it('does not call a command broken for printing an error as data', () => {
    const json =
      '{"cycle":{"error":"STATE.json: ENOENT: no such file or directory"}}'
    expect(classify(json, 0)).toBe('runs')
  })

  it('still calls a command broken when it actually failed', () => {
    expect(classify('bash: cmd_missing: command not found', 127)).toBe('BROKEN')
  })

  it('needs the message too, not the exit code alone', () => {
    // A non-zero exit with an ordinary refusal is not a broken command: half
    // this toolkit exits 2 to say "I could not check", which is an answer.
    expect(classify('Needs SUPABASE_URL and SUPABASE_SERVICE_KEY', 2)).toBe(
      'asks'
    )
  })

  it('enumerates the toolkit rather than a hardcoded list', () => {
    const names = subcommands(require('path').join(process.cwd(), 'tri'))
    expect(
      names.length,
      'no subcommands found — the matcher, not the CLI'
    ).toBeGreaterThan(50)
    expect(names).toContain('who')
  })

  it('every skip names a subcommand that exists', () => {
    /*
     * Nine of an earlier eighteen named Russian aliases, which the sweep never
     * runs -- entries that matched nothing and read exactly like coverage. A
     * skip that cannot fire is indistinguishable from a command that passed.
     */
    const names = subcommands(require('path').join(process.cwd(), 'tri'))
    const unknown = Object.keys(SKIP).filter(k => !names.includes(k))
    expect(unknown, 'skips naming no real subcommand').toEqual([])
  })

  it('every skip carries a reason, so a skip cannot read as a pass', () => {
    for (const [name, reason] of Object.entries(SKIP)) {
      expect(
        String(reason).length,
        `${name} is skipped without saying why`
      ).toBeGreaterThan(10)
    }
  })
})
