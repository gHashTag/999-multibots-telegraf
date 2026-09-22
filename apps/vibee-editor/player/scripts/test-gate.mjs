#!/usr/bin/env node
// The player's test gate for the image build (apps/vibee-editor/Dockerfile,
// stage `test`). It decides on the TESTS, not on vitest's exit code alone.
//
// Measured 2026-09-22 in `docker build --target test`: 117 files, 1134 tests,
// all passed - and vitest exited 1 on one unhandled error,
//
//   Error: [vitest-worker]: Timeout calling "onTaskUpdate"
//
// its own worker RPC missing a 60 s deadline on a builder under load. That is
// the harness, not the app, and a gate that fails on it blocks a deploy for
// nothing. So:
//
//   - any failed test or failed file refuses the build;
//   - fewer than MIN_TESTS tests refuses it too (a suite that stopped running
//     must not read as a suite that passed);
//   - an unhandled error refuses it UNLESS every one of them is the worker RPC
//     timeout above - a rejection thrown by app code is still a failure.

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const MIN_TESTS = 1000
const REPORT = '/tmp/vitest-report.json'
// Both read the repository ROOT, which the build context (apps/vibee-editor)
// cannot contain. The repository's own hooks still run them.
const EXCLUDE = [
  'src/components/Profile/WelcomeOnboarding.no-later-on-paywall.test.ts',
  'src/components/Telegram/__tests__/startParamContract.test.ts',
]

const run = spawnSync(
  'npx',
  [
    'vitest',
    'run',
    '--retry=2',
    '--maxWorkers=2',
    ...EXCLUDE.flatMap(path => ['--exclude', path]),
    '--reporter=default',
    '--reporter=json',
    `--outputFile=${REPORT}`,
  ],
  { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }
)
const output = `${run.stdout ?? ''}${run.stderr ?? ''}`
process.stdout.write(output)

const refuse = reason => {
  console.error(`\ntest gate: REFUSED - ${reason}`)
  process.exit(1)
}

let report
try {
  report = JSON.parse(readFileSync(REPORT, 'utf8'))
} catch {
  refuse(`vitest wrote no readable report (exit ${run.status})`)
}

const failed = report.numFailedTests + report.numFailedTestSuites
if (failed > 0) refuse(`${failed} failed test(s) or file(s)`)
if (report.numTotalTests < MIN_TESTS) {
  refuse(
    `only ${report.numTotalTests} tests ran; expected at least ${MIN_TESTS}`
  )
}

if (run.status !== 0) {
  // jsdom prints `Error: Not implemented: HTMLMediaElement...` during ordinary
  // passing tests; it is noise, and it must not be what lets a run through.
  const errors = (output.match(/^\s*Error: .*$/gm) ?? []).filter(
    line => !/Not implemented: HTMLMediaElement/.test(line)
  )
  const onlyRpcTimeouts =
    output.includes('Unhandled Error') &&
    errors.length > 0 &&
    errors.every(line => /\[vitest-worker\]: Timeout calling/.test(line))
  if (!onlyRpcTimeouts) refuse(`vitest exited ${run.status}`)
  console.warn(
    `\ntest gate: passed with vitest exit ${run.status} - every test passed and ` +
      'the only unhandled errors were vitest worker RPC timeouts'
  )
}

console.log(
  `\ntest gate: PASSED - ${report.numPassedTests} of ${report.numTotalTests} tests`
)
