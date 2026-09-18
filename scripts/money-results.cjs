#!/usr/bin/env node
/**
 * WHICH MONEY CALLS THROW THEIR ANSWER AWAY.
 *
 * `updateUserBalance` returns `false` and does NOT throw when the payer row is
 * missing or the insert is refused. `directPaymentProcessor` answers
 * `{ success: false }`. A statement that starts with `await` and binds nothing
 * therefore cannot tell a moved star from a lost one, and everything after it
 * proceeds as though the money arrived.
 *
 * Every conversion of a money guard this week found the same shape underneath:
 * charge or credit, result discarded, silence. This counts them in one pass
 * instead of by hand.
 *
 *   node scripts/money-results.cjs [--all]
 *
 * UNREACHABLE STUBS ARE COUNTED APART, NOT IGNORED. fal-render-wizard keeps a
 * charge and a refund after an early `return`, as a sketch for the day the Fal
 * handler exists. They move no money today, so calling them defects would teach
 * everyone to skip this list -- but they are exactly what a future edit
 * revives, so they are named, under their own heading.
 *
 * Read-only. Exit: 0 nothing live discards its answer, 1 something does, 2 the
 * source tree could not be read.
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const { repoFiles, selfCheck } = require('./lib/repo-sources.cjs')

const PAINT = Boolean(process.stdout.isTTY)
const ESC = PAINT ? String.fromCharCode(27) : ''
const wrap = (code, s) => (PAINT ? `${ESC}[${code}m${s}${ESC}[0m` : s)
const dim = s => wrap(2, s)
const red = s => wrap(31, s)
const green = s => wrap(32, s)
const yellow = s => wrap(33, s)
const bold = s => wrap(1, s)

/**
 * The calls that move money and answer with a value nobody is forced to read.
 * Named here rather than guessed, because a regex over "anything with balance
 * in the name" would drown the list in reads.
 */
const MOVERS = [
  'updateUserBalance',
  'directPaymentProcessor',
  'processBalanceOperation',
  /*
   * ADDED 2026-09-19, FOUND BY WALKING THE MONEY MAP.
   *
   * These two move money without looking like it, which is why the first
   * version of this list missed them:
   *
   *   updatePaymentStatus    flips a row PENDING -> COMPLETED. The balance is a
   *     filtered sum over COMPLETED rows, so that flip IS the credit -- no
   *     amount is touched anywhere in the call. It answers {data, error} and
   *     reports "not found" rather than throwing, so a discarded result cannot
   *     tell a credited person from an untouched one.
   *   createSuccessfulPayment  inserts a COMPLETED row directly, with whatever
   *     `stars` it is given. Today its only caller is the admin override with
   *     stars: 0, which is why nothing has noticed; the surface itself can mint.
   */
  'updatePaymentStatus',
  'createSuccessfulPayment',
]

/*
 * NOT ON THE LIST, AND WHY.
 *
 * `refundUser` is the obvious candidate and the first version of this tool had
 * it, which produced 27 "defects" in one run. It returns NOTHING: it decides,
 * messages the person and logs its own failures inside (price/helpers/
 * refundUser.ts). There is no answer to discard, so every one of those 27 was
 * my tool inventing a fault -- the exact failure these guards exist to catch,
 * pointed at me. A mover belongs here only if its answer is the caller's to
 * read.
 */
const RETURNS_NOTHING = ['refundUser']

/**
 * THE JUDGEMENT, PURE, SO IT CAN BE TESTED WITHOUT A REPOSITORY.
 *
 * A discarded call is a statement that STARTS with `await <mover>(` -- the
 * value goes nowhere. `const x = await mover(...)`, `return await mover(...)`
 * and `if (await mover(...))` all keep it.
 */
function scan(text, mover) {
  const found = []
  const lines = text.split('\n')

  /*
   * THE MARKER COVERS THE REST OF ITS BLOCK, NOT THE NEXT LINE.
   *
   * `eslint-disable-next-line no-unreachable` silences the linter for one
   * statement, but the code AFTER that statement is just as unreachable -- the
   * `return` above it is what made all of it dead. The first version stopped at
   * the next line and so reported the refund three statements later as live,
   * which is the opposite of the truth. The block is taken to end where the
   * indentation falls below the marker's own.
   */
  let deadUntilIndentBelow = null

  lines.forEach((line, i) => {
    if (/eslint-disable-next-line\s+no-unreachable/.test(line)) {
      deadUntilIndentBelow = line.search(/\S/)
      return
    }
    if (deadUntilIndentBelow !== null && line.trim() !== '') {
      const indent = line.search(/\S/)
      if (indent < deadUntilIndentBelow) deadUntilIndentBelow = null
    }
    const re = new RegExp(`^\\s*await\\s+${mover}\\s*\\(`)
    if (re.test(line)) {
      found.push({
        line: i + 1,
        mover,
        unreachable: deadUntilIndentBelow !== null,
      })
    }
  })
  return found
}

function main() {
  const all = process.argv.includes('--all')
  let files
  try {
    selfCheck(ROOT)
    files = repoFiles(ROOT).filter(
      f => /^src\//.test(f) && /\.ts$/.test(f) && !/__tests__/.test(f)
    )
  } catch (e) {
    console.error(`could not read the source tree: ${e.message}`)
    process.exitCode = 2
    return
  }

  /*
   * An empty population is a broken reader, not a clean repository: this tree
   * has hundreds of files and always has.
   */
  if (files.length < 100) {
    console.error(
      `only ${files.length} source files found -- the reader is broken, and any "clean" answer here would be meaningless`
    )
    process.exitCode = 2
    return
  }

  const live = []
  const stubs = []
  let calls = 0

  for (const file of files) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8')
    for (const mover of MOVERS) {
      if (!text.includes(mover)) continue
      calls += text.split(`${mover}(`).length - 1
      for (const hit of scan(text, mover)) {
        ;(hit.unreachable ? stubs : live).push(`${file}:${hit.line}  ${mover}`)
      }
    }
  }

  console.log(bold('money calls whose answer is thrown away'))
  console.log(
    dim(
      `  ${calls} calls to ${MOVERS.join(', ')} across ${files.length} files.` +
        ' A call that binds nothing cannot tell a moved star from a lost one.'
    )
  )
  console.log()

  if (live.length) {
    console.log(red(`${live.length} live:`))
    for (const l of live) console.log(`  ${l}`)
    process.exitCode = 1
  } else {
    console.log(
      green('none live: every money call that runs binds its answer.')
    )
  }

  if (stubs.length) {
    console.log()
    console.log(
      yellow(`${stubs.length} in unreachable code`) +
        dim(' -- they move nothing today, and are what a future edit revives:')
    )
    for (const l of stubs) console.log(`  ${l}`)
  }

  if (all) {
    console.log()
    console.log(dim('--all: every file that mentions a mover'))
    for (const file of files) {
      const text = fs.readFileSync(path.join(ROOT, file), 'utf8')
      const hits = MOVERS.filter(m => text.includes(`${m}(`))
      if (hits.length) console.log(`  ${file}  ${dim(hits.join(', '))}`)
    }
  }
}

module.exports = { scan, MOVERS, RETURNS_NOTHING }

if (require.main === module) main()
