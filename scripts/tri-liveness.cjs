#!/usr/bin/env node
/**
 * Does every subcommand of this toolkit still run?
 *
 * 113 of them have accumulated, and not one had ever been executed THROUGH the
 * CLI: each was tried by calling its script or function directly, which is how
 * twelve of them shipped for months dropping their first argument. A toolkit
 * trusted without being exercised is the same defect one floor up from the code
 * it checks.
 *
 * IT PRINTS EVERY COMMAND, not only the broken ones. A sweep that reports
 * failures alone is silent both when nothing is broken and when nothing ran,
 * and those two are the same picture. The population is the point.
 *
 * SAFE BY EXCLUSION, NOT BY HOPE. Anything that mutates state, spends money or
 * takes a remote lock is named below and skipped, and the skips are printed
 * with their reason -- a skip nobody can see is indistinguishable from a pass.
 */
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

/**
 * Commands this sweep must not run, each with the reason it is skipped.
 *
 * KEYED BY THE NAME THE SWEEP ACTUALLY RUNS -- the FIRST alias of a branch,
 * because that is what subcommands() returns. Half of an earlier version of
 * this list named the Russian aliases, which the sweep never runs: nine
 * entries that matched nothing and looked exactly like coverage. The test
 * beside this file now fails if a key names no real subcommand, so a skip
 * cannot quietly stop skipping.
 */
const SKIP = {
  mutate: 'edits source to check that a test bites',
  lock: 'takes a shared lock other sessions wait on',
  unlock: 'releases a lock this run never took',
  funnel: 'runs inside Railway and bills a remote service',
  stuck: 'runs inside Railway',
  events: 'runs inside Railway',
  keys: 'runs inside Railway and probes paid providers',
  lesson: 'appends to a skill file from stdin',
  // Killed mid-run it leaves probe-zzz-selfcheck-tmp.cjs in scripts/. The
  // command cleans up when allowed to finish; this sweep gives each command a
  // few seconds and then kills it, so the debris is the SWEEP's doing. A
  // checker that dirties the tree it checks is not a checker.
  'probes-check': 'writes a temp probe a killed run would leave behind',
}

function subcommands(triPath) {
  const lines = fs.readFileSync(triPath, 'utf8').split('\n')
  const start = lines.findIndex(l => /^case "\$action" in/.test(l))
  const out = []
  for (let i = start; i < lines.length; i++) {
    const m = /^ {2}([a-zA-Zа-яёА-ЯЁ|_-]+)\)/.exec(lines[i]) // cyrillic-ok: subcommand aliases are Russian
    if (m) out.push(m[1].split('|')[0])
  }
  return out
}

/**
 * BROKEN NEEDS BOTH A FAILING EXIT AND A FAILING MESSAGE.
 *
 * The message alone is not enough, and the first run of this sweep proved it:
 * `tri status` prints a JSON report that CONTAINS "no such file or directory"
 * -- as data, describing a file it looked for and did not find. It exits 0 and
 * did exactly what it should. Matching the phrase alone called a working
 * command broken.
 *
 * A command that fails says so with its exit code. Requiring both means a tool
 * that REPORTS an error is no longer mistaken for a tool that IS one.
 */
function classify(out, code) {
  // Order matters: a command killed by the alarm has a non-zero code and a
  // truncated message, which is exactly the shape the broken test looks for.
  if (code === 142 || code === 124) return 'SLOW'
  if (
    code !== 0 &&
    /command not found|No such file|SyntaxError|Cannot find module|is not a function/i.test(
      out
    )
  )
    return 'BROKEN'
  if (/Needs |usage:|укажите|нужно указать/i.test(out)) return 'asks' // cyrillic-ok: the tools answer in Russian
  /*
   * 142, NOT 124.
   *
   * 124 is what GNU `timeout` returns, and macOS does not have it -- this
   * sweep uses `perl -e 'alarm shift; exec @ARGV'`, which dies on SIGALRM and
   * exits 128+14. Keeping the borrowed constant meant a command killed for
   * being slow fell through to the broken branch, and secrets-audit -- which
   * reads 3783 tracked files and finishes fine when given the time -- was
   * reported as broken twice.
   *
   * Both are accepted: the sweep may one day run somewhere that has timeout.
   */
  if (code === 142 || code === 124) return 'SLOW'
  return 'runs'
}

function main() {
  const root = path.resolve(__dirname, '..')
  const tri = path.join(root, 'tri')
  const names = subcommands(tri)
  const seconds = Number(process.env.TRI_LIVENESS_TIMEOUT || 10)
  const tally = { runs: 0, asks: 0, BROKEN: 0, SLOW: 0, skipped: 0 }
  console.log(`subcommands found: ${names.length}, timeout ${seconds}s each\n`)
  for (const n of names) {
    if (SKIP[n]) {
      tally.skipped++
      console.log(`  skip    ${n.padEnd(26)} ${SKIP[n]}`)
      continue
    }
    let out = '',
      code = 0
    try {
      out = execFileSync(
        'perl',
        ['-e', 'alarm shift; exec @ARGV', String(seconds), 'bash', tri, n],
        {
          cwd: root,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      )
    } catch (e) {
      out = `${e.stdout || ''}${e.stderr || ''}`
      code = e.status ?? 1
    }
    const verdict = classify(out, code)
    tally[verdict]++
    const first =
      String(out)
        .split('\n')
        .find(l => l.trim()) || '(no output)'
    console.log(
      `  ${verdict.padEnd(7)} ${n.padEnd(26)} ${first.trim().slice(0, 62)}`
    )
  }
  console.log(
    `\n${names.length} subcommands: ${tally.runs} ran, ${tally.asks} asked for input, ` +
      `${tally.SLOW} timed out, ${tally.BROKEN} broken, ${tally.skipped} skipped by name`
  )
  if (process.argv.includes('--gate') && tally.BROKEN > 0) process.exit(1)
}

module.exports = { subcommands, classify, SKIP }
if (require.main === module) main()
