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
 * The log is .git/tri-gate.log: per clone, never committed.
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
const LOG = join(ROOT, '.git', 'tri-gate.log')

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
if (cmd === 'record') {
  const [check, verdict, ...detail] = rest
  appendFileSync(
    LOG,
    JSON.stringify({
      at: new Date().toISOString(),
      tree: treeHash(),
      check,
      ok: verdict === 'ok',
      detail: detail.join(' '),
    }) + '\n'
  )
  process.exit(0)
}
if (cmd !== 'show') {
  console.error(
    'usage: tri gate   (records come from full-run, mutants, spec-controls)'
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
