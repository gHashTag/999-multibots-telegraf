#!/usr/bin/env node
/**
 * IS THIS TEST BROKEN, OR DOES IT JUST NOT MAKE UP ITS MIND.
 *
 * The push gate now tells the two apart -- it re-runs a fresh failure alone and
 * only blocks on what fails twice. What it cannot do is FIX the noisy one; it
 * prints the name and moves on, and somebody has to come back to it.
 *
 * This is the coming back. Run a test file several times and say what happened,
 * because "it passed when I ran it" is not an answer: a test that passes four
 * times in five is not a passing test, it is a coin.
 *
 *   node scripts/is-it-flaky.cjs <test-file> [more...] [--times N]
 *
 * Exit code: 0 stable (all runs agreed), 1 flaky (the runs disagreed), 2 the
 * runner never started, so nothing was learned.
 */
'use strict'

const { execFileSync } = require('node:child_process')

/*
 * COLOUR ONLY FOR A TERMINAL.
 *
 * These tools are meant to be composed -- `tri readers | awk '{print $1}'` is
 * the obvious next thing somebody does with an inventory. With escape codes
 * always on, the first field is not a path but a path wearing a dim marker, and
 * the loop fails with "no such file or directory" on a name that plainly
 * exists. Measured on my own output, 2026-09-17.
 *
 * `isTTY` is false for a pipe, a file and a subshell, which is exactly the set
 * of places where colour is noise rather than help.
 */
const PAINT = Boolean(process.stdout.isTTY)
const ESC = PAINT ? String.fromCharCode(27) : ''
const wrap = (code, s) => (PAINT ? `${ESC}[${code}m${s}${ESC}[0m` : s)
const dim = s => wrap(2, s)
const red = s => wrap(31, s)
const green = s => wrap(32, s)

function runOnce(files) {
  try {
    execFileSync('npx', ['vitest', 'run', '--reporter=dot', ...files], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return true
  } catch {
    return false
  }
}

function main() {
  const argv = process.argv.slice(2)
  const at = argv.indexOf('--times')
  const times = at === -1 ? 5 : Math.max(2, Number(argv[at + 1]) || 5)
  const files = argv.filter((a, i) => !a.startsWith('--') && i !== at + 1)

  if (!files.length) {
    console.error('usage: is-it-flaky.cjs <test-file> [more...] [--times N]')
    process.exitCode = 2
    return
  }

  const outcomes = []
  for (let i = 0; i < times; i++) {
    const ok = runOnce(files)
    outcomes.push(ok)
    process.stdout.write(ok ? green('.') : red('F'))
  }
  process.stdout.write('\n')

  const passes = outcomes.filter(Boolean).length
  const fails = outcomes.length - passes

  if (fails === 0) {
    console.log(green(`stable: ${passes}/${times} passed.`))
    console.log(
      dim(
        'Stable ALONE. The gate runs it beside 180 others, under load -- which' +
          ' is where it failed. Try again while something heavy is building.'
      )
    )
    return
  }
  if (passes === 0) {
    console.log(red(`broken: 0/${times} passed. This is not noise.`))
    process.exitCode = 1
    return
  }
  /*
   * THE ANSWER PEOPLE DO NOT WANT. A test that passes most of the time is the
   * expensive kind: it is trusted, and it is wrong often enough to teach
   * everybody to re-run rather than to read.
   */
  console.log(red(`flaky: ${passes}/${times} passed, ${fails} failed.`))
  console.log(
    dim(
      'A test that passes four times in five is not a passing test, it is a' +
        ' coin. Find the shared state or the clock it depends on.'
    )
  )
  process.exitCode = 1
}

main()
