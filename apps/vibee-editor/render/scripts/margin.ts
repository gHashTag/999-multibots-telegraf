/**
 * `tri margin`: the margin of every image and video the code can sell.
 *
 * Reads the code's own tables and nothing else -- no network, no tokens, no
 * database. The arithmetic and its reasons live in src/agent/margin-report.ts,
 * where the type checker and the tests can see them; this file only prints.
 *
 * Exit code 1 when any sale is below cost (LOSS), so a shift can gate on it.
 */
import { marginReport, formatMarginReport } from '../src/agent/margin-report'

const report = marginReport()
console.log(formatMarginReport(report))
process.exitCode = report.rows.some(r => r.flags.includes('LOSS')) ? 1 : 0
