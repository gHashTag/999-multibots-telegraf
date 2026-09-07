import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * A URL WE HAND OUT MUST BE A URL WE ANSWER.
 *
 * Robokassa was called back at `${base}/payment-success` for nine months while
 * the router serving it is mounted under '/api'. Both halves were individually
 * correct and disagreed only about where they met, so every shape-checking test
 * around that route passed. scripts/url-reachability.cjs asks the joining
 * question, and this file keeps it running and keeps its answer at zero.
 *
 * The script carries its own self-checks and exits 2 when it cannot see
 * straight -- a short ground truth over-accuses, and it refuses rather than
 * publish that. Running it here means those refusals are exercised on every
 * suite run, not only when somebody remembers the command.
 */

const REPO = path.resolve(__dirname, '..', '..', '..')
const SCRIPT = path.join(REPO, 'scripts', 'url-reachability.cjs')

function run(args: string[] = []) {
  try {
    return {
      code: 0,
      out: execFileSync('node', [SCRIPT, ...args], {
        cwd: REPO,
        encoding: 'utf8',
      }),
    }
  } catch (e: any) {
    return {
      code: e.status as number,
      out: String(e.stdout) + String(e.stderr),
    }
  }
}

describe('every URL we build on our own host lands on a route we serve', () => {
  it('the census can see, and says how much it saw', () => {
    // A count is the difference between "nothing is wrong" and "nothing was
    // looked at". The script refuses (exit 2) if the ground truth is short,
    // so reaching this assertion at all is already part of the check.
    const { code, out } = run()
    expect(code, out).toBe(0)

    const served = Number(/served routes parsed:\s+(\d+)/.exec(out)?.[1] ?? 0)
    const built = Number(
      /URLs built on our own host:\s+(\d+)/.exec(out)?.[1] ?? 0
    )
    expect(
      served,
      'the served surface must be read, not assumed'
    ).toBeGreaterThan(30)
    expect(built, 'there must be URLs to judge').toBeGreaterThan(10)
  })

  it('no URL we hand out is left undeclared', () => {
    const { code, out } = run(['--gate'])
    expect(
      code,
      'a URL built on our own host lands on nothing we serve, and nothing says why:\n' +
        out
    ).toBe(0)
  })

  it('the script it runs is the one in the repository', () => {
    // Cheap, and it catches the case where the file is deleted or renamed and
    // the two tests above start passing for the wrong reason.
    expect(fs.existsSync(SCRIPT)).toBe(true)
    const src = fs.readFileSync(SCRIPT, 'utf8')
    expect(src).toContain('SELF-CHECK FAILED')
    expect(src).toContain('DECLARED')
  })
})
