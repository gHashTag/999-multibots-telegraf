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
  // The autopilot's topic queue is the only human-written input to the reel
  // factory, and nothing between the file and a published reel checked it: a
  // malformed entry does not crash, it PUBLISHES. The validator was written,
  // committed, and then called by nothing -- on 2026-09-15 it failed with ten
  // violations on both committed queues, one of which (R4) named a defect that
  // was live in the feed. A gate nobody runs is a gate that does not exist.
  [
    'check:topics',
    'node',
    [
      'loop/validate-topics.mjs',
      'apps/vibee-editor/render/loop/topics.json',
      'loop/topics.json',
    ],
  ],
]

// One step is a known flake, not a code signal: test:bun runs its files under a
// single concurrent bun process that share the lazy supabase Proxy singleton and
// process.env, and a rare race makes an ai-models `.rejects.toThrow()` assertion
// mis-fire — the gate then prints "FAILED: 1 of 13" though nothing is broken
// (measured ~1 flake in 10 runs; isolation and a re-run are always green). Re-run
// it ONCE on failure so the flake does not false-red the whole gate and send the
// next reader chasing a phantom regression. This hides nothing: a real break
// reproduces on the re-run and the exit code below still fails. Judged by exit
// code, like every other step — never by grepping output.
//
// `audit` is flaky for a different reason: `bun audit` queries the registry over
// the network, and a slow or unreachable registry makes it hang (~30s) and exit
// non-zero — observed once mid-session, then passing in 0.4s with 0 critical on
// the immediate re-run. Same treatment: retry once. A real critical advisory is
// persistent and still fails the re-run, so nothing is masked.
const FLAKY_RETRY = new Set(['test:bun', 'audit'])

// Preflight: a node_modules that has become a symlink to itself makes every
// step below fail to spawn (exit -1 in 0.0s) — thirteen false failures for one
// broken link. Name it here instead of letting the gate blame the code. This
// only reads (findSelfLoops), it does not repair: a gate that checks must not
// silently mutate. The one-line fix is printed; the loop's own preflight runs
// it automatically.
const { findSelfLoops } = require('./heal-node-modules.cjs')
const selfLoops = findSelfLoops(process.cwd())
if (selfLoops.length) {
  console.error('\nnode_modules is a symlink to itself — the gate cannot run.')
  console.error('(This is an environment fault, not a code failure.)\n')
  for (const { dir } of selfLoops) {
    console.error(`  ${dir === '.' ? '' : dir + '/'}node_modules -> itself`)
  }
  console.error(
    '\nRepair, then re-run:\n  node scripts/heal-node-modules.cjs\n'
  )
  process.exit(3)
}

const results = []
const runStep = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'pipe', encoding: 'utf8' })
  // A command that could not start is NOT a pass. spawnSync reports
  // status === null in that case; without this branch a missing bun would
  // read as a green step.
  const code = r.error ? -1 : r.status === null ? -1 : r.status
  return { code, out: (r.stdout || '') + (r.stderr || '') }
}
for (const [name, cmd, args] of STEPS) {
  process.stdout.write(`... ${name}`)
  const started = Date.now()
  let { code, out } = runStep(cmd, args)
  let retried = false
  if (code !== 0 && FLAKY_RETRY.has(name)) {
    retried = true
    ;({ code, out } = runStep(cmd, args))
  }
  const secs = ((Date.now() - started) / 1000).toFixed(1)
  results.push({ name, code, secs, out })
  const mark = code === 0 ? 'OK  ' : 'FAIL'
  const note = retried
    ? code === 0
      ? ' (flaked, green on re-run)'
      : ' (failed on re-run too)'
    : ''
  process.stdout.write(`\r${mark} ${name} (${secs}s)${note}\n`)
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
