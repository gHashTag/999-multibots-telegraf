#!/usr/bin/env node
/**
 * tri gate -- the PR's local-gate table, from what really ran.
 *
 * Loop turn 8 (27.09.2026): a spec PR said "18/18 host controls" before the
 * controls had run; they were run after, and the line stayed only because
 * the number came out the same. Every gate table in these PRs was typed by
 * hand from memory of the outputs. Now `tri full-run`, `tri mutants` and
 * `tri spec-controls` each record their verdict here, stamped with the hash
 * of the working tree they ran on, and `tri gate` prints the table for the
 * tree as it is now -- a run on another tree is listed as stale, not as
 * proof.
 *
 *   node gate.mjs record <check> <ok|fail> <detail...>
 *   node gate.mjs show            (tri gate)
 *
 * The log is <git dir>/tri-gate.log: per clone (per worktree), never
 * committed.
 */
import { execFileSync } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')
/*
 * The git dir, not ROOT/.git: in a worktree (`tri worktree`, every loop
 * tick) .git is a FILE pointing at the real one, and appending to
 * .git/tri-gate.log threw ENOTDIR -- after the checks had run, so every
 * verdict recorded from a worktree was lost behind a stack trace while the
 * command still exited 0 (CRM mobile loop, tick 4).
 */
const LOG = join(
  execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim(),
  'tri-gate.log'
)

/**
 * The tree the working directory holds -- tracked edits and new files, as
 * .gitignore sees them -- without touching the real index: a throwaway
 * index file takes `git add -A` and gives `git write-tree`. After a commit
 * of exactly this, HEAD^{tree} is the same hash.
 */
export function treeHash() {
  const dir = mkdtempSync(join(tmpdir(), 'tri-gate-'))
  const env = { ...process.env, GIT_INDEX_FILE: join(dir, 'index') }
  try {
    execFileSync('git', ['read-tree', 'HEAD'], { cwd: ROOT, env })
    execFileSync('git', ['add', '-A'], { cwd: ROOT, env })
    return execFileSync('git', ['write-tree'], {
      cwd: ROOT,
      env,
      encoding: 'utf8',
    }).trim()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const [cmd, ...rest] = process.argv.slice(2)
if (cmd === 'tree') {
  // A check takes this at its START (TRI_GATE_START) and record compares.
  console.log(treeHash())
  process.exit(0)
}
if (cmd === 'record') {
  const [check, verdict, ...detail] = rest
  /*
   * The tree at the END is the one stamped -- and the one a later `tri gate`
   * compares with. Loop turn 9 (27.09.2026): a file made while `tri
   * full-run` was going went into its record as tested. A check that saw
   * the tree move under it is recorded as not ok, whatever it printed.
   */
  const end = treeHash()
  const start = process.env.TRI_GATE_START
  const moved = !!start && start !== end
  appendFileSync(
    LOG,
    JSON.stringify({
      at: new Date().toISOString(),
      tree: end,
      check,
      ok: verdict === 'ok' && !moved,
      detail: moved
        ? `the tree changed during the run -- run it again (${detail.join(' ')})`
        : detail.join(' '),
    }) + '\n'
  )
  process.exit(0)
}
if (cmd === 'forget') {
  /*
   * A CHECK THAT WILL NEVER RUN AGAIN UNDER ITS OLD NAME. Loop turn 13: the
   * shot records gained the language (`shot x 390` -> `shot x 390 ru`), and
   * the old names stayed in the log as "stale -- run it again" forever:
   * nothing runs under them any more, so the table could never be clean.
   * The log only grows; a tombstone says the name is retired, and why.
   */
  const [check, ...why] = rest
  if (!check) {
    console.error('usage: tri gate forget <check name> [why]')
    process.exit(2)
  }
  appendFileSync(
    LOG,
    JSON.stringify({
      at: new Date().toISOString(),
      check,
      forgotten: true,
      detail: why.join(' '),
    }) + '\n'
  )
  console.log(`forgot "${check}": it no longer counts, fresh or stale`)
  process.exit(0)
}
if (cmd !== 'show') {
  console.error(
    'usage: tri gate [forget <check> [why]]   (records come from full-run, mutants, spec-controls, image-gate, shot)'
  )
  process.exit(2)
}
const now = treeHash()
const rows = existsSync(LOG)
  ? readFileSync(LOG, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l))
  : []
const latest = new Map()
for (const r of rows) latest.set(r.check, r)
// A retired name (tri gate forget) counts neither as fresh nor as stale.
for (const [check, r] of latest) if (r.forgotten) latest.delete(check)
const here = [...latest.values()].filter(r => r.tree === now)
const stale = [...latest.values()].filter(r => r.tree !== now)
if (!here.length) {
  console.log('no check has run on this tree yet: run them, then tri gate')
} else {
  console.log('| check | result |')
  console.log('|---|---|')
  // A `|` inside a cell splits the markdown row (loop turn 8: vitest's
  // "5006 passed | 21 skipped" broke the table in the PR comment).
  const cell = v => String(v).replace(/\|/g, '\\|')
  for (const r of here)
    console.log(
      `| \`${cell(r.check)}\` | ${r.ok ? '' : '**RED** '}${cell(r.detail)} |`
    )
}
for (const r of stale)
  console.log(`stale: ${r.check} ran on another tree (${r.at}) -- run it again`)
process.exit(here.length && here.every(r => r.ok) && !stale.length ? 0 : 1)
