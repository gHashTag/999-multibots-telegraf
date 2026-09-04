#!/usr/bin/env node
'use strict'

/**
 * An optional parameter that gates a rejection makes the rejection OPT-IN.
 *
 * The shape that named this: assertPublicRedirect, the axios beforeRedirect
 * hop guard, threw only `if (host && isPrivateHost(host))`. An options object
 * naming no host fell through and the redirect was followed -- a guard whose
 * whole job is to block, treating absence of its input as do-not-block
 * (#1789).
 *
 * Scoped to the CONTAINING function, and that is the whole difference between
 * a useful number and a useless one. Searching whole files reports 9, by
 * pairing a parameter declared in one function with a condition written in
 * another. Scoped, it reports 3.
 *
 * A list to read, not a verdict: an optional parameter is often exactly right,
 * and two of the three found here are redundant checks that no caller
 * activates and nothing depends on.
 */

const fs = require('fs')
const path = require('path')
const readCensus = require('./lib/read-census.cjs').census
const scan = readCensus('исходники')
const { execFileSync } = require('child_process')
const { blank, selfCheck: blankSelfCheck } = require('./lib/blank-code.cjs')

const ROOT = path.resolve(__dirname, '..')

/** Function bodies, by brace matching from the signature. */
function functions(code) {
  const out = []
  for (const m of code.matchAll(
    /(?:function\s+(\w+)|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?)\s*(?:async\s*)?\(([^)]*)\)/g
  )) {
    const open = code.indexOf('{', m.index + m[0].length)
    if (open < 0) continue
    let depth = 0
    let j = open
    for (; j < code.length; j++) {
      if (code[j] === '{') depth++
      else if (code[j] === '}') {
        depth--
        if (!depth) {
          j++
          break
        }
      }
    }
    out.push({
      name: m[1] || m[2] || '(anon)',
      params: m[3],
      body: code.slice(open, j),
      at: m.index,
    })
  }
  return out
}

const REJECTION = '(?:return (?:null|false)|continue|throw)'
const gatesRejection = (body, param) =>
  new RegExp(
    `if\\s*\\(\\s*${param}\\s*(?:!==\\s*undefined|&&)[^]{0,500}?${REJECTION}`
  ).test(body)

function selfCheck() {
  blankSelfCheck()
  const fail = why => {
    console.error(`самопроверка не прошла: ${why}`)
    process.exit(2)
  }

  const sample = `
function outer(a: string, host?: string) {
  if (host && isPrivate(host)) {
    throw new Error('no')
  }
}
function neighbour(b: string) {
  if (b) {
    return null
  }
}
`
  const fns = functions(sample)
  if (fns.length !== 2) fail(`функций разобрано ${fns.length}, а не 2`)
  if (!gatesRejection(fns[0].body, 'host')) {
    fail('условие на необязательный параметр не распознано')
  }
  // The scoping property itself: the neighbour's rejection must not be
  // attributed to outer's parameter. Searching the whole sample would do
  // exactly that, and did.
  if (gatesRejection(fns[0].body, 'b')) {
    fail('отказ соседней функции приписан этому параметру')
  }
  // A parameter that is optional but gates nothing is not a finding.
  if (gatesRejection('{ return host ? 1 : 2 }', 'host')) {
    fail('тернарник без отказа принят за охрану')
  }
  console.log('самопроверка: функции разобраны, область видимости соблюдена')
}

selfCheck()

const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter(
    f => f.startsWith('src/') && f.endsWith('.ts') && !f.includes('__tests__')
  )

// Counted by ABSOLUTE POSITION so an overlapping match cannot count the same
// parameter twice. functions() does match nested declarations, so the risk is
// real -- but deduplicating changed the total by zero, which means it was not
// happening here. Kept because it costs nothing and removes the question.
//
// The number differs from the 316 vs 214 an earlier ad-hoc count produced, and
// the reason is neither double-counting nor a bug: that matcher demanded a
// SIMPLE type after the question mark, so every optional parameter typed with
// an object literal or a complex generic was invisible to it. Two matchers,
// two populations.
const optionalPositions = new Set()
const found = []
for (const f of files) {
  let raw
  // Reading nothing must not look like finding nothing.
  raw = scan.read1(path.join(ROOT, f))
  if (raw === null) continue
  const code = blank(raw)
  for (const fn of functions(code)) {
    const paramsAt = code.indexOf(fn.params, fn.at)
    for (const pm of fn.params.matchAll(/(\w+)\?\s*:/g)) {
      optionalPositions.add(`${f}:${paramsAt + pm.index}`)
      if (!gatesRejection(fn.body, pm[1])) continue
      const line = raw.slice(0, fn.at).split('\n').length
      found.push(`  ${f.replace('src/', '')}:${line}  ${fn.name}(${pm[1]}?)`)
    }
  }
}

scan.report(files.length)
console.log(`\nнеобязательных параметров: ${optionalPositions.size}`)
console.log(`\n=== ОТКАЗ ЗА НЕОБЯЗАТЕЛЬНЫМ ПАРАМЕТРОМ: ${found.length} ===`)
console.log('   (список для чтения: спроси, что будет, если не передать)\n')
found.sort().forEach(r => console.log(r))
