#!/usr/bin/env node
/**
 * WHICH REMOTE BRANCH DOES THIS BRANCH PULL FROM, AND DOES IT STILL EXIST.
 *
 * Found 2026-09-18: local `main` was configured to merge `refs/heads/docs/form-111`
 * -- a branch deleted weeks earlier. `git pull` on main failed outright ("no such
 * ref was fetched") and `git status` reported "ahead 47" against a ref nobody has,
 * which is not a warning anybody reads as "your main is misconfigured".
 *
 * Two shapes are dangerous, and only one of them is noisy:
 *
 *   GONE      the upstream no longer exists -> pull fails, status lies about
 *             how far ahead or behind you are. Loud, but only when you pull.
 *   CROSSED   the upstream exists and is a DIFFERENT branch -> pull SUCCEEDS and
 *             merges somebody else's work into yours. Silent, and the reason
 *             this check exists at all.
 *
 * A branch with no upstream at all is fine: that is an unpushed local branch.
 *
 *   node scripts/upstream-check.cjs [--all]
 *
 * By default it judges the branches that matter -- the current one and main --
 * and merely counts the rest, because this repository carries dozens of dead
 * local branches and a wall of them would bury the two lines worth reading.
 * Read-only: it never changes a configuration, it prints the command that would.
 *
 * Exit: 0 nothing to fix, 1 a branch that matters is misconfigured, 2 not a
 * repository.
 */
'use strict'

const { execSync } = require('node:child_process')

const PAINT = Boolean(process.stdout.isTTY)
const ESC = PAINT ? String.fromCharCode(27) : ''
const wrap = (code, s) => (PAINT ? `${ESC}[${code}m${s}${ESC}[0m` : s)
const dim = s => wrap(2, s)
const red = s => wrap(31, s)
const green = s => wrap(32, s)
const yellow = s => wrap(33, s)
const bold = s => wrap(1, s)

const git = args => {
  try {
    return execSync(`git ${args}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

/** Every local branch with the remote and ref its pull is configured to use. */
function configured() {
  /*
   * The format string is QUOTED. Unquoted, `%(refname:short)` is a shell
   * syntax error, git never runs, and this printed an empty table under a
   * heading -- a check that reports nothing wrong because it looked at
   * nothing. That is the failure mode a checker must not have, so an empty
   * branch list is treated as a breakage below, not as "all clear".
   */
  const out = git("for-each-ref --format='%(refname:short)' refs/heads/") || ''
  return out
    .split('\n')
    .map(l => l.replace(/^'|'$/g, ''))
    .filter(Boolean)
    .map(branch => {
      const merge = git(`config --get branch.${branch}.merge`)
      const remote = git(`config --get branch.${branch}.remote`)
      if (!merge || !remote) return { branch, upstream: null }
      const short = merge.replace(/^refs\/heads\//, '')
      const exists = git(`rev-parse --verify -q ${remote}/${short}`) !== null
      return {
        branch,
        remote,
        upstream: short,
        exists,
        /*
         * The quiet one: it resolves, so nothing complains -- and it is not
         * the branch you think you are on.
         *
         * Tracking origin/main from a feature branch is NOT this. `git checkout
         * -b x` under branch.autoSetupMerge sets it deliberately, and pulling
         * main into a feature branch is what people mean to do. `main` itself
         * tracking something other than origin/main is the real defect, and so
         * is any branch pointed at a third branch.
         */
        crossed:
          exists && short !== branch && (branch === 'main' || short !== 'main'),
      }
    })
}

function verdict(row) {
  if (!row.upstream) return { ok: true, why: 'no upstream (local only)' }
  if (!row.exists)
    return {
      ok: false,
      why: `${row.remote}/${row.upstream} is gone -- pull fails, status counts against nothing`,
    }
  if (row.crossed)
    return {
      ok: false,
      why: `pulls ${row.remote}/${row.upstream}, NOT ${row.remote}/${row.branch} -- a pull merges another branch`,
    }
  return { ok: true, why: `${row.remote}/${row.upstream}` }
}

function main() {
  if (git('rev-parse --git-dir') === null) {
    console.error('not a git repository')
    process.exitCode = 2
    return
  }
  const all = process.argv.includes('--all')
  const current = git('rev-parse --abbrev-ref HEAD')
  const rows = configured()

  // A repository always has at least the branch you are standing on.
  if (!rows.length) {
    console.error('could not read the branch list -- this check saw nothing')
    process.exitCode = 2
    return
  }

  /*
   * THE ONES THAT MATTER. Everything else in this repository is a local
   * leftover nobody pulls; judging them would turn a two-line answer into a
   * forty-line one and teach everybody to skip it.
   */
  const matters = new Set([current, 'main'].filter(Boolean))
  const judged = rows.filter(r => all || matters.has(r.branch))

  console.log(bold('where each branch pulls from'))
  let bad = 0
  for (const row of judged.sort((a, b) => a.branch.localeCompare(b.branch))) {
    const v = verdict(row)
    if (!v.ok) bad++
    const mark = v.ok ? green('ok  ') : red('BAD ')
    const here = row.branch === current ? '*' : ' '
    console.log(`  ${mark}${here} ${row.branch.padEnd(28)} ${dim(v.why)}`)
  }

  if (!all) {
    const rest = rows.filter(r => !matters.has(r.branch))
    const restBad = rest.filter(r => !verdict(r).ok).length
    if (rest.length) {
      console.log()
      console.log(
        dim(
          `${rest.length} other local branches, ${restBad} of them misconfigured` +
            ' -- leftovers; --all to see them'
        )
      )
    }
  }

  if (bad) {
    console.log()
    console.log(yellow('fix, for each BAD branch:'))
    console.log('  git branch --set-upstream-to=origin/<branch> <branch>')
    process.exitCode = 1
  }
}

main()
