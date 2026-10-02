import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/*
 * TWO GATES AT ONCE MUST NOT JUDGE EACH OTHER'S TREE.
 *
 * The report lived at one fixed /tmp path. On 2026-10-02 two sessions gated
 * in parallel and overwrote each other's report; a vitest that died before
 * writing would have read the stale file and called it a verdict. The path is
 * now per process and per call, and it is cleared before the run.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { reportPath } = require('../../../scripts/test-gate.cjs')

describe('the gate reads only its own report', () => {
  it('two processes never share a report path', () => {
    expect(reportPath(101, 1)).not.toBe(reportPath(202, 1))
  })

  it('two runs in one process never share a report path', () => {
    expect(reportPath()).not.toBe(reportPath())
  })

  it('no fixed report path is left, and a dead run cannot read an old file', () => {
    const src = readFileSync(
      join(__dirname, '../../../scripts/test-gate.cjs'),
      'utf8'
    )
    expect(src).not.toMatch(/const TMP = '\/tmp\//)
    expect(src).toMatch(/fs\.rmSync\(TMP, \{ force: true \}\)\n {2}const args/)
  })
})
