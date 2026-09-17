#!/usr/bin/env node
/**
 * WHY IS THIS LINE BLOCKED -- the question the gate never answered.
 *
 * `no-cyrillic-guard.cjs` prints the lines it refuses and nothing else. It has
 * three exemptions, and when a line is refused the interesting fact is WHICH of
 * them nearly applied and what is missing.
 *
 * Without that, the loop is: add a marker, watch the formatter move it, add it
 * again. Measured 2026-09-17: five attempts on one file, each reintroducing the
 * same complaint, because the marker was going somewhere the formatter would
 * not leave it. One printed line -- "this commit removes nothing carrying this
 * word" -- ends that.
 *
 * Reads the SAME records the gate decides on (`scanDiff`), so the explanation
 * cannot drift from the verdict.
 *
 *   node scripts/cyrillic-why.cjs [range|staged]
 *
 * Exit code matches the gate: 0 clean, 1 at least one line blocked, 2 the diff
 * could not be read.
 */
'use strict'

const { execSync } = require('node:child_process')
const fs = require('node:fs')
const guard = require('./no-cyrillic-guard.cjs')

const MARKER = 'cyrillic-ok'
const NEXT_LINE = guard.NEXT_LINE
const RUNS = /[\u0400-\u04FF]+/g
const ESC = String.fromCharCode(27)

const dim = s => `${ESC}[2m${s}${ESC}[0m`
const red = s => `${ESC}[31m${s}${ESC}[0m`
const green = s => `${ESC}[32m${s}${ESC}[0m`

function diffFor(mode) {
  const sh = c =>
    execSync(c, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  if (mode === 'staged') return 'git diff --cached --unified=0 --no-color'
  try {
    const upstream = sh(
      "git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}'"
    )
    if (upstream) return `git diff --unified=0 --no-color ${upstream}...HEAD`
  } catch {
    /* no upstream yet */
  }
  const base = sh('git merge-base origin/main HEAD')
  return `git diff --unified=0 --no-color ${base}..HEAD`
}

/*
 * Named by shape, because the way out differs by shape and picking the wrong
 * one costs a round trip through the formatter.
 */
const WAY_OUT = {
  call: `the formatter will move a trailing marker off this line -- put  ${NEXT_LINE}  in a comment on the line ABOVE`,
  jsx: `JSX takes no // comment -- put  ${NEXT_LINE}  in a comment on the line ABOVE, or move the text into a string literal`,
  key: `an object key cannot be renamed locally -- check every reader first, or use  ${NEXT_LINE}  above it`,
  regex:
    'nothing here strips a regex literal -- write the letters as \\u escapes, the way the guard itself does',
  plain: `add  ${MARKER}  to the end of this line`,
}

function shapeOf(line) {
  /*
   * A regex literal is not a string literal and nothing strips it, so Cyrillic
   * inside one is refused. Four branches in this repository sit on exactly that
   * and the marker is the wrong answer there: the guard's own file writes the
   * range as \\u escapes precisely so it does not trip itself.
   */
  if (/\/[^/]*[\u0400-\u04FF][^/]*\//.test(line)) return 'regex'
  if (/^\s*[\p{L}_$][\p{L}\p{N}_$]*\($/u.test(line)) return 'call'
  if (/^\s*</.test(line) || /\/>\s*$/.test(line)) return 'jsx'
  if (/^\s*[\p{L}_$][\p{L}\p{N}_$]*\s*:/u.test(line)) return 'key'
  return 'plain'
}

/**
 * MARKERS THAT NO LONGER GUARD ANYTHING.
 *
 * Borrowed from `eslint --report-unused-disable-directives`: a suppression
 * outlives the thing it suppressed, and nobody goes back for it. Then the next
 * person reads the marker as evidence that the line needs one.
 *
 * A trailing marker is unused when its own line has no Cyrillic outside a
 * literal; a next-line directive is unused when the line below it has none.
 */
function reportUnused() {
  const files = execSync('git ls-files', {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\n')
    .filter(f => /\.(ts|tsx|js|jsx|mjs|cjs|swift)$/.test(f))

  let unused = 0
  for (const f of files) {
    let lines
    try {
      lines = fs.readFileSync(f, 'utf8').split('\n')
    } catch {
      continue
    }
    const swift = /\.swift$/.test(f)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line.includes(MARKER)) continue
      const directive = line.includes(NEXT_LINE)
      const guarded = directive ? (lines[i + 1] ?? '') : line
      if (guard.cyrillicOutsideStrings(guarded, swift)) continue
      unused++
      console.log(`${dim(`${f}:${i + 1}`)}  ${line.trim()}`)
    }
  }
  console.log(
    unused
      ? dim(`\n${unused} marker(s) guard nothing any more.`)
      : green('every marker still guards a line.')
  )
}

function main() {
  if (process.argv.includes('--unused')) return reportUnused()
  const mode = process.argv[2] === 'staged' ? 'staged' : 'range'
  let diff
  try {
    diff = execSync(diffFor(mode), {
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
    })
  } catch {
    console.error(`cyrillic-why: could not read the ${mode} diff`)
    process.exitCode = 2
    return
  }

  const { records, removedByFile } = guard.scanDiff(diff)
  const blocked = records.filter(r => !r.exempt)
  const passed = records.filter(r => r.exempt)

  if (!records.length) {
    console.log(green(`no Cyrillic outside literals in the ${mode} diff.`))
    return
  }

  for (const r of blocked) {
    console.log(`\n${red('blocked')}  ${r.file}`)
    console.log(`  ${r.line.trim()}`)
    const runs = [...new Set(r.line.match(RUNS) || [])]
    const removed = removedByFile.get(r.file) || ''
    const fresh = runs.filter(w => !removed.includes(w))
    if (fresh.length && fresh.length < runs.length) {
      console.log(
        dim(
          `  not a reflow: ${fresh.join(', ')} -- this commit removes nothing carrying it`
        )
      )
    } else if (fresh.length) {
      console.log(
        dim('  not a reflow: this commit removes nothing carrying these words')
      )
    }
    console.log(dim(`  way out: ${WAY_OUT[shapeOf(r.line)]}`))
  }

  if (passed.length) {
    const by = passed.reduce(
      (a, r) => ((a[r.exempt] = (a[r.exempt] || 0) + 1), a),
      {}
    )
    const parts = Object.entries(by).map(([k, v]) => `${v} by ${k}`)
    console.log(dim(`\nexempt: ${parts.join(', ')}`))
  }

  console.log(
    blocked.length
      ? red(`\n${blocked.length} line(s) blocked.`)
      : green('\nnothing blocked.')
  )
  // exitCode, not exit(): see the note in no-cyrillic-guard.cjs -- exit() drops
  // writes still queued on a pipe, and this output is always read through one.
  process.exitCode = blocked.length ? 1 : 0
}

main()
