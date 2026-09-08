import { describe, it, expect } from 'vitest'
import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

/*
 * TWELVE SUBCOMMANDS SILENTLY DROPPED THEIR FIRST ARGUMENT.
 *
 * `tri` shifts the subcommand off before the case statement, so inside a
 * branch $1 is already the first real argument -- and every branch forwarded
 * "${@:2}", which skips it. `tri ledger --gate` forwarded nothing at all.
 *
 * It stayed invisible because each script was tested BY CALLING IT DIRECTLY.
 * The flag arrived every time it was tried and never when it was used, which
 * is the difference between testing a function and testing the wiring that
 * reaches it.
 *
 * Two assertions, deliberately of different kinds: one reads the shape of the
 * forwarding, the other runs the real CLI and looks at what the script did
 * with what it received.
 */
const TRI = path.join(process.cwd(), 'tri')

describe('tri forwards the arguments it was given', () => {
  it('does not forward with ${@:2}, which skips one after the shift', () => {
    const src = fs.readFileSync(TRI, 'utf8')
    expect(src).toContain('shift 2>/dev/null')
    /*
     * Comment lines are excluded, and the reason is a rule this project has
     * already paid for: a quotation is not an invocation. The note explaining
     * this very bug quotes the broken form twice, and a checker that counted
     * mentions would flag the explanation of the fix as the fix's absence.
     */
    const offenders = src
      .split('\n')
      .filter(l => !l.trim().startsWith('#'))
      .filter(l => l.includes('"${@:2}"'))
    expect(
      offenders.map(l => l.trim().slice(0, 60)),
      'these branches skip their first argument'
    ).toEqual([])
  })

  it('really passes a file argument through to the script', () => {
    // The dashboard auditor prints usage when it gets no .html argument and
    // asks for credentials when it does. Which message appears says whether
    // the argument survived the trip.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tri-args-'))
    const f = path.join(dir, 'x.html')
    fs.writeFileSync(f, '<b>Robokassa 1/2</b>')
    try {
      const r = spawnSync('bash', [TRI, 'витрина', f], {
        // cyrillic-ok: the subcommand name
        encoding: 'utf8',
        env: {
          ...process.env,
          SUPABASE_URL: '',
          SUPABASE_SERVICE_KEY: '',
          SUPABASE_SERVICE_ROLE_KEY: '',
        },
      })
      const out = `${r.stdout}${r.stderr}`
      expect(out, 'the file argument never reached the script').not.toContain(
        'usage:'
      )
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
