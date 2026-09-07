import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

/**
 * A TOP-UP THAT NEVER COMPLETED, AND NOBODY FOUND OUT FOR NINE MONTHS.
 *
 * Robokassa confirms within seconds; a row left PENDING means somebody pressed
 * pay and was never credited. Measured 2026-09-08: from March 2026 not a single
 * top-up completed, and 208 rows are still pending. People kept trying -- 4347
 * stars on 22 June among them. Balances ran out in June and generations fell
 * from 88 a month to 6.
 *
 * Nothing was watching, so the script is only worth having if it cannot report
 * a comfortable zero by accident. These checks are about exactly that.
 */
const SCRIPT = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'scripts',
  'stuck-payments.cjs'
)
const ROOT = path.join(__dirname, '..', '..', '..')

const run = (env: NodeJS.ProcessEnv, args: string[] = []) => {
  try {
    return {
      code: 0,
      out: execFileSync('node', [SCRIPT, ...args], {
        cwd: ROOT,
        encoding: 'utf8',
        env,
      }),
    }
  } catch (e: any) {
    return {
      code: e.status ?? -1,
      out: String(e.stdout || '') + String(e.stderr || ''),
    }
  }
}

describe('the stuck-payment watchdog cannot report a comfortable zero', () => {
  it('exits 2 without credentials instead of saying nothing is stuck', () => {
    const bare = { ...process.env }
    delete bare.SUPABASE_URL
    delete bare.SUPABASE_SERVICE_ROLE_KEY
    delete bare.SUPABASE_SERVICE_KEY
    delete bare.SUPABASE_ANON_KEY
    const { code, out } = run(bare, ['--gate'])
    expect(code, `output:\n${out}`).toBe(2)
    expect(out).toContain('NO CREDENTIALS')
    expect(out).not.toMatch(/STUCK, FRESH[^\n]*0/)
  })

  const source = fs.readFileSync(SCRIPT, 'utf8')

  /**
   * Both self-checks matter and they fail in opposite directions: a filter that
   * matches nothing would report zero stuck, and one that matches everything
   * would report every row stuck.
   */
  it('refuses if no top-up has ever completed — a broken filter, not a fact', () => {
    expect(source).toContain('no COMPLETED top-up exists in all of history')
    expect(source).toMatch(/everDone\.n === 0/)
  })

  it('refuses if the status filter selects everything', () => {
    expect(source).toContain('the status filter selects everything')
    expect(source).toMatch(/everPending\.n >= everAll\.n/)
  })

  /**
   * The backlog cannot be fixed by code and would hold the gate permanently
   * red, which is how a gate stops being read. Only rows young enough that the
   * callback should already have arrived decide the exit code.
   */
  it('gates on fresh stuck top-ups and only reports the backlog', () => {
    expect(source).toMatch(/GATE && fresh\.n > 0/)
    expect(source).toContain('not gated')
    expect(source).not.toMatch(/GATE && backlog\.n > 0/)
  })

  /** Refunds are credits back for failed jobs, not somebody trying to pay. */
  it('counts only real top-ups, not refunds', () => {
    expect(source).toMatch(/not\('description', 'ilike', '%efund%'\)/)
  })

  /**
   * A CORRECTION, GUARDED SO IT CANNOT BE LOST.
   *
   * An earlier reading of mine called 208 pending rows "208 people who pressed
   * pay and were not credited". A PENDING row is written when the INVOICE is
   * issued, before any money moves, so most of them are abandoned checkouts --
   * and they always existed: 15 in May 2025, 28 in June, long before anything
   * broke. The sum of their stars is not a debt.
   *
   * What abandonment does not explain is a completion rate of zero from March
   * 2026, and that is what the gate watches. The script has to say so, or the
   * next reader repeats the overstatement.
   */
  it('says plainly that a pending row is not proof of a lost payment', () => {
    expect(source).toContain('not that money changed hands')
    expect(source).toMatch(/abandoned checkouts/)
    expect(source).toMatch(/completion rate of/)
  })

  it('offers the reconciliation list only on request, never in the summary', () => {
    // telegram ids are people; they belong where the owner runs the tool.
    expect(source).toMatch(
      /const DETAIL = process\.argv\.includes\('--detail'\)/
    )
    expect(source).toMatch(/if \(DETAIL\)/)
    const summaryEnd = source.indexOf('if (DETAIL)')
    expect(source.slice(0, summaryEnd)).not.toContain('telegram_id')
  })

  it('never credits anybody: the money direction stays with the owner', () => {
    expect(source).not.toMatch(/\.update\(|\.insert\(|\.upsert\(|\.delete\(/)
    expect(source).toContain("owner's decision")
  })
})
