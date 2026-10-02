import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { failures } from '../../scripts/test-gate-verdict.mjs'

/**
 * THE GATE NAMES WHAT FAILED; IT DOES NOT ADD UP UNLIKE THINGS.
 *
 * 2026-10-02: one failing test in one describe in one file refused the deploy
 * of 648d13fd8 as "3 failed test(s) or file(s)" -- vitest counts each describe
 * as a suite, and the gate summed tests and suites. The report below has the
 * shape vitest 5 wrote for exactly that run (numFailedTests 1,
 * numFailedTestSuites 2).
 */
const ROOT = '/workspace/player'

const realRun = {
  numFailedTests: 1,
  numFailedTestSuites: 2,
  testResults: [
    {
      name: `${ROOT}/src/lib/clientErrorBeacon.test.ts`,
      status: 'failed',
      message: '',
      assertionResults: [
        {
          ancestorTitles: ['client errors reach the owner'],
          title: 'the beacon posts to /api/client-error',
          status: 'passed',
        },
        {
          ancestorTitles: ['client errors reach the owner'],
          title: 'the agent stream retries a network drop once',
          status: 'failed',
        },
      ],
    },
    {
      name: `${ROOT}/src/lib/agentChatText.test.ts`,
      status: 'passed',
      assertionResults: [{ title: 'says it', status: 'passed' }],
    },
  ],
}

describe('the test gate verdict', () => {
  it('reads one failing test as one, with its file and titles', () => {
    const out = failures(realRun, ROOT)
    expect(out.summary).toBe('1 failed test(s) in 1 file(s)')
    expect(out.tests).toEqual([
      'src/lib/clientErrorBeacon.test.ts > client errors reach the owner > ' +
        'the agent stream retries a network drop once',
    ])
    expect(out.files).toEqual([])
  })

  it('names a file that failed without a failing test by its error', () => {
    const out = failures(
      {
        testResults: [
          {
            name: `${ROOT}/src/pages/x.test.ts`,
            status: 'failed',
            message: "ENOENT: no such file '../../bin/x.mjs'\n    at open",
            assertionResults: [],
          },
        ],
      },
      ROOT
    )
    expect(out.files).toEqual([
      "src/pages/x.test.ts: ENOENT: no such file '../../bin/x.mjs'",
    ])
    expect(out.summary).toBe('1 file(s) that did not run in 1 file(s)')
  })

  it('says nothing when nothing failed', () => {
    expect(
      failures({ testResults: [realRun.testResults[1]] }, ROOT).summary
    ).toBe('')
  })

  it('is what the gate refuses with, not the old sum', () => {
    const gate = fs.readFileSync(
      path.join(__dirname, '../../scripts/test-gate.mjs'),
      'utf8'
    )
    expect(gate).toContain('refuse(failed.summary)')
    expect(gate).not.toContain('failed test(s) or file(s)')
  })
})
