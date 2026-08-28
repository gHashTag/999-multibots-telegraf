#!/usr/bin/env node
/**
 * One run of everything that has to be green before a release.
 *
 * WHY. GitHub Actions does not run in this repository: jobs fail within
 * seconds with "The job was not started because recent account payments have
 * failed or your spending limit needs to be increased", and the last
 * successful run was 2026-06-02. While that holds there is nothing to check a
 * "green CI" claim against, and broken steps pile up unseen: bare `bun test`
 * was exiting 1 on 548 failures and `prettier --check` was failing on 456
 * files, both for months.
 *
 * This script reproduces the set locally and judges by EXIT CODE only, never
 * by grepping output — that had already produced two false greens in this
 * work (a pattern that matched the wrong thing, and an exit code taken from
 * the last command of a pipeline).
 *
 * A failing step does NOT abort the run. Otherwise the first error hides
 * everything after it, and each fix reveals one more problem instead of the
 * whole list. The exit code is non-zero if any step failed.
 */
'use strict'

const { spawnSync } = require('child_process')

const STEPS = [
  ['typecheck', 'bun', ['run', 'typecheck']],
  ['lint', 'bun', ['run', 'lint']],
  ['prettier', 'bunx', ['prettier', '--check', 'src/**/*.ts']],
  ['build', 'bun', ['run', 'build']],
  ['check:dead-domain', 'bun', ['run', 'check:dead-domain']],
  ['check:events', 'bun', ['run', 'check:events']],
  ['check:player-types', 'bun', ['run', 'check:player-types']],
  ['security:scan', 'bun', ['run', 'security:scan']],
  ['audit', 'bun', ['audit', '--audit-level=critical']],
  ['test:bun', 'bun', ['run', 'test:bun']],
  ['test:player', 'bun', ['run', 'test:player']],
  ['test:vitest', 'bun', ['run', 'test:vitest']],
  ['test-gate', 'node', ['scripts/test-gate.cjs']],
]

const results = []
for (const [name, cmd, args] of STEPS) {
  process.stdout.write(`... ${name}`)
  const started = Date.now()
  const r = spawnSync(cmd, args, { stdio: 'pipe', encoding: 'utf8' })
  // A command that could not start is NOT a pass. spawnSync reports
  // status === null in that case; without this branch a missing bun would
  // read as a green step.
  const code = r.error ? -1 : r.status === null ? -1 : r.status
  const secs = ((Date.now() - started) / 1000).toFixed(1)
  results.push({ name, code, secs, out: (r.stdout || '') + (r.stderr || '') })
  process.stdout.write(`\r${code === 0 ? 'OK  ' : 'FAIL'} ${name} (${secs}s)\n`)
}

const failed = results.filter(r => r.code !== 0)
if (failed.length) {
  console.error(`\nFAILED: ${failed.length} of ${results.length} steps\n`)
  for (const f of failed) {
    console.error(`--- ${f.name} (exit ${f.code}) ---`)
    console.error(f.out.split('\n').filter(Boolean).slice(-12).join('\n'))
    console.error('')
  }
  process.exit(1)
}

console.log(`\nAll ${results.length} steps green`)
