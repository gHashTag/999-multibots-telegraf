#!/usr/bin/env node
/**
 * TESTS THAT READ SOURCE AS TEXT, AND THE PATHS THEY STILL BELIEVE IN.
 *
 * A test that opens a file with `fs.readFileSync` and asserts on its contents is
 * invisible to `vitest related`: that gate follows the IMPORT graph, and reading
 * a file is not importing it. So moving code can break such a guard and the
 * pre-push run will not notice.
 *
 * Measured 2026-09-18. The top-up flow moved out of Chat.tsx into a shared hook
 * so the profile could use it. A guard on a MONEY path -- "a failed credit stops
 * the retries and says so" -- went red, and nothing caught it: it surfaced two
 * days later, dragged into a run by an unrelated file. The behaviour had not
 * changed at all; only the file had.
 *
 *   node scripts/text-readers.cjs            the inventory
 *   node scripts/text-readers.cjs --gate     exit 1 if any target is missing
 *
 * WHAT THIS CAN AND CANNOT SEE. It resolves the paths and says which no longer
 * exist -- the loud half of the breakage. It cannot know whether the STRING a
 * guard looks for is still in the file it points at; only running the test says
 * that. So this is an inventory plus a dead-path check, not a promise.
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

const ESC = String.fromCharCode(27)
const dim = s => `${ESC}[2m${s}${ESC}[0m`
const red = s => `${ESC}[31m${s}${ESC}[0m`
const green = s => `${ESC}[32m${s}${ESC}[0m`

const ROOT = process.cwd()

/**
 * `path.join(__dirname, '..', 'a', 'b.ts')` and `readFileSync('a/b.ts')`, the
 * two shapes this repository actually uses. Anything built from a variable is
 * out of reach and is reported as unresolved rather than guessed at.
 */
const JOIN = /path\.join\(\s*__dirname\s*,([^)]*)\)/g
const SEGMENT = /'([^']+)'/g

/**
 * Comments out, first. The only "dead path" the first draft found was a
 * `path.join(__dirname, '../uploads', id)` written INSIDE a comment explaining
 * the bug the test guards -- a finding that would have sent somebody looking
 * for a directory nobody reads. A scanner that cannot tell code from prose
 * reports prose.
 */
function codeOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(l => l.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n')
}

function targetsIn(file, source) {
  const found = []
  let m
  while ((m = JOIN.exec(source))) {
    const parts = []
    let p
    SEGMENT.lastIndex = 0
    while ((p = SEGMENT.exec(m[1]))) parts.push(p[1])
    if (!parts.length) continue
    found.push(path.resolve(path.dirname(file), ...parts))
  }
  return found
}

function main() {
  const gate = process.argv.includes('--gate')
  const files = execSync('git ls-files', {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\n')
    .filter(f => /\.test\.(ts|tsx)$/.test(f))

  let readers = 0
  let dead = 0

  for (const f of files) {
    let src
    try {
      src = fs.readFileSync(f, 'utf8')
    } catch {
      continue
    }
    if (!/readFileSync\s*\(/.test(codeOnly(src))) continue
    const targets = targetsIn(path.join(ROOT, f), codeOnly(src))
    if (!targets.length) continue
    readers += 1

    const missing = targets.filter(t => !fs.existsSync(t))
    if (missing.length) {
      dead += missing.length
      console.log(red(`${f}`))
      for (const t of missing) {
        console.log(`    missing: ${path.relative(ROOT, t)}`)
      }
    } else {
      console.log(dim(`${f}  ${targets.length} file(s), all present`))
    }
  }

  console.log()
  console.log(
    `${readers} test file(s) read source as text.` +
      ' They are invisible to `vitest related`.'
  )
  if (dead) {
    console.log(red(`${dead} target(s) no longer exist.`))
    if (gate) process.exitCode = 1
  } else {
    console.log(green('every path they point at still exists.'))
  }
  console.log(
    dim(
      'A path that exists is not a promise: only running the test says whether' +
        ' the string it looks for is still there.'
    )
  )
}

main()
