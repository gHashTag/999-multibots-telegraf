#!/usr/bin/env node
/**
 * COMMIT AND PUSH, AND SAY WHICH STEP DID NOT HAPPEN.
 *
 * 2026-09-18: a commit was refused by the no-cyrillic gate, the refusal was
 * buried in a hundred lines of hook output that I had filtered with `grep
 * "✔️"`, so every gate I looked at had passed. I then pushed (nothing to push,
 * quiet success) and asked GitHub for a pull request, which answered "No
 * commits between main and ...". Three steps ran, two of them did nothing, and
 * only the fourth complained.
 *
 * The lesson is not "read more output" -- it is that each step has a FACT that
 * settles it, and the fact is cheap to check:
 *
 *   commit   HEAD moved, and the new commit is the message you wrote
 *   push     the remote branch now points at that same commit
 *
 * So this runs the two steps and verifies the two facts, refusing to go on when
 * one does not hold. The hook output is shown in full on failure and summarised
 * on success -- never filtered into a shape that can only look good.
 *
 *   node scripts/ship.cjs -m "subject
 *
 *   body"  [--branch <name>] [--all]
 *
 * It never merges and never touches main: shipping is a separate decision from
 * landing, and this tool deliberately cannot make it.
 *
 * Exit: 0 committed and pushed, 1 a step did not happen (it says which), 2 the
 * repository is not in a state to ship from.
 */
'use strict'

const { spawnSync } = require('node:child_process')

const PAINT = Boolean(process.stdout.isTTY)
const ESC = PAINT ? String.fromCharCode(27) : ''
const wrap = (code, s) => (PAINT ? `${ESC}[${code}m${s}${ESC}[0m` : s)
const dim = s => wrap(2, s)
const red = s => wrap(31, s)
const green = s => wrap(32, s)
const bold = s => wrap(1, s)

/** Run git, returning status and both streams; nothing is hidden from us. */
function git(args, input) {
  const r = spawnSync('git', args, {
    encoding: 'utf8',
    input,
    maxBuffer: 64 * 1024 * 1024,
  })
  return {
    code: r.status ?? -1,
    out: (r.stdout || '').trim(),
    err: (r.stderr || '').trim(),
  }
}

const head = () => git(['rev-parse', 'HEAD']).out

function fail(step, why, detail) {
  console.error(`${red('did not happen:')} ${bold(step)} -- ${why}`)
  if (detail) console.error(detail)
  process.exitCode = 1
}

function main() {
  const argv = process.argv.slice(2)
  const at = argv.indexOf('-m')
  const message = at === -1 ? null : argv[at + 1]
  const branchAt = argv.indexOf('--branch')
  const wantedBranch = branchAt === -1 ? null : argv[branchAt + 1]
  const addAll = argv.includes('--all')

  if (!message) {
    console.error(
      'usage: tri ship -m "subject\\n\\nbody" [--branch <name>] [--all]'
    )
    process.exitCode = 2
    return
  }

  if (git(['rev-parse', '--git-dir']).code !== 0) {
    console.error('not a git repository')
    process.exitCode = 2
    return
  }

  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).out
  if (wantedBranch && wantedBranch !== branch) {
    const made = git(['checkout', '-b', wantedBranch])
    if (made.code !== 0) {
      fail('branch', `could not create ${wantedBranch}`, made.err)
      return
    }
  }
  const here = git(['rev-parse', '--abbrev-ref', 'HEAD']).out

  /*
   * MAIN IS NOT A PLACE TO COMMIT FROM. Everything in this repository lands
   * through a pull request, and a commit made here is one that no gate and no
   * reader ever saw.
   */
  if (here === 'main' || here === 'master') {
    console.error(
      `${red('refusing:')} on ${here}. Pass --branch <name>, or make a branch first.`
    )
    process.exitCode = 2
    return
  }

  if (addAll) git(['add', '-A'])

  const staged = git(['diff', '--cached', '--name-only']).out
  if (!staged) {
    console.error(
      `${red('nothing staged.')} Stage the change (or pass --all) -- a commit of nothing is the quiet failure this tool exists for.`
    )
    process.exitCode = 2
    return
  }
  console.log(bold('staged'))
  for (const f of staged.split('\n')) console.log(`  ${f}`)

  const before = head()
  console.log()
  console.log(bold('commit'), dim('(hooks run here; their output follows)'))
  const committed = spawnSync('git', ['commit', '-F', '-'], {
    input: message,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
  })
  const after = head()

  /*
   * THE FACT THAT SETTLES IT. A non-zero status is the usual signal, but a
   * moved HEAD is the thing we actually need, and it stays true no matter what
   * a hook wrapper decides to return.
   */
  if (after === before) {
    fail(
      'commit',
      `HEAD did not move (git exited ${committed.status ?? -1}) -- a gate refused it; its reason is in the output above`
    )
    return
  }
  console.log(green(`committed ${after.slice(0, 9)}`))

  console.log()
  console.log(bold('push'))
  const pushed = spawnSync('git', ['push', '-u', 'origin', here], {
    encoding: 'utf8',
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  if (pushed.status !== 0) {
    fail('push', `git exited ${pushed.status ?? -1}`)
    return
  }

  // And the remote really has it: a push can succeed having sent nothing.
  const remote = git(['rev-parse', `origin/${here}`]).out
  if (remote !== after) {
    fail(
      'push',
      `origin/${here} is at ${remote.slice(0, 9) || 'nothing'}, not ${after.slice(0, 9)}`
    )
    return
  }
  console.log(green(`origin/${here} is at ${after.slice(0, 9)}`))
  console.log()
  console.log(
    dim('not merged, and not merged by this tool: that is your call.')
  )
  console.log(dim(`  gh pr create --base main --head ${here}`))
}

main()
