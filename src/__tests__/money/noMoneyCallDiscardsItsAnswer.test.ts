/**
 * NO MONEY CALL THAT RUNS MAY THROW ITS ANSWER AWAY -- ANYWHERE, NOT JUST IN
 * THE FILES SOMEBODY THOUGHT TO NAME.
 *
 * `updateUserBalance` returns `false` and does NOT throw when the payer row is
 * missing or the insert is refused; `directPaymentProcessor` answers
 * `{success: false}`; `processBalanceOperation` the same. A statement that
 * starts with `await` and binds nothing cannot tell a moved star from a lost
 * one, and everything after it proceeds as though the money arrived.
 *
 * Every money guard converted this week found that exact shape underneath, one
 * file at a time, each pinned by its own test naming its own file. This is the
 * population check the others cannot be: it reads the whole tree, so a NEW site
 * is caught on the commit that introduces it rather than on the day somebody
 * happens to look.
 *
 * Unreachable stubs are reported separately by the tool and are NOT failed
 * here: they move no money today. As of 2026-09-18 there are none of either --
 * the two that existed (fal-render's sketch for a handler that does not exist
 * yet) now bind their answers too, because a sketch is what a future edit
 * wakes up.
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..', '..')
const SCRIPT = path.join(ROOT, 'scripts', 'money-results.cjs')

function census() {
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, [SCRIPT], {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
      }),
    }
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string }
    return {
      code: err.status ?? -1,
      out: (err.stdout ?? '') + (err.stderr ?? ''),
    }
  }
}

describe('no money call that runs discards its answer', () => {
  it('counts a population big enough for the answer to mean something', () => {
    // Exit 2 is the tool refusing to look; a clean verdict about nothing is
    // the failure this whole family of checks keeps having.
    const { out, code } = census()
    expect(code).not.toBe(2)
    expect(out).toMatch(/\d+ calls to/)
  })

  it('finds no live call whose answer goes nowhere', () => {
    const { code, out } = census()
    expect(code, `money-results reported:\n${out}`).toBe(0)
  })
})
