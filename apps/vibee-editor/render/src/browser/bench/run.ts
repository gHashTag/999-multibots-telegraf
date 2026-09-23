/**
 * Runs the cases (cases.ts) against find-target, in a document written by
 * hand, and prints one line per case and a score. No browser, no network,
 * no model: it is arithmetic over markup, so it can run on every change.
 */
import { findProbe, foundOf } from '../find-target'
import { CASES, type BenchCase } from './cases'

export interface Result {
  from: string
  want: string
  expect: string | null
  got: string | null
  ok: boolean
}

/**
 * The element the probe lands on, by id. `read` is the DOM to run in,
 * injected so this is testable and so the runner can use jsdom or a fake.
 */
export function judge(
  cases: BenchCase[],
  press: (html: string, want: string) => string | null
): { results: Result[]; score: number } {
  const results = cases.map(c => {
    const got = press(c.html, c.want)
    return {
      from: c.from,
      want: c.want,
      expect: c.expect,
      got,
      ok: got === c.expect,
    }
  })
  const passed = results.filter(r => r.ok).length
  return {
    results,
    score: cases.length ? Math.round((passed / cases.length) * 100) : 0,
  }
}

/** The report, as the person reads it in a terminal. Pure. */
export function report(out: { results: Result[]; score: number }): string {
  const lines = out.results.map(
    r =>
      `${r.ok ? 'ok  ' : 'MISS'} ${r.want} -> ${r.got ?? 'nothing'}` +
      (r.ok ? '' : ` (wanted ${r.expect ?? 'nothing'})`) +
      `\n     ${r.from}`
  )
  return [
    ...lines,
    '',
    `score ${out.score}% (${out.results.filter(r => r.ok).length} of ${out.results.length})`,
  ].join('\n')
}

export { CASES, findProbe, foundOf }
