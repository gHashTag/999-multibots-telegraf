#!/usr/bin/env node
/**
 * WHICH DIRECTORY EACH POPULATION-BUILDING TEST ACTUALLY WALKS.
 *
 * Ratchets in this repository work by building a population and comparing it to
 * a registry. The population is a directory walk, and the root of that walk is
 * the silent half of every such promise: a header can say "a NEW site fails here
 * until it is reviewed" while the walk only covers one subdirectory.
 *
 * That gap has been real twice. callbackNumberParseRegistry guarded the
 * zero-cost bypass class but walked only src/scenes and matched one spelling of
 * a digit capture, so handlers, commands and routes were invisible (#1865). And
 * before that, tri trust probed three root-package files and printed a verdict
 * about the whole gate.
 *
 * So the question "what does this walk actually cover?" is worth asking of every
 * ratchet, and it should cost one command rather than an afternoon.
 *
 * THIS IS A READING LIST, NOT A VERDICT. A narrow root is often exactly right:
 * charge-result-checked-ratchet walks src/scenes on purpose and says so, because
 * the repo-wide half of that class is held by unchecked-money-result, which
 * walks all of src. creditWebhookAuthenticated walks api_server/routes because
 * that is where webhooks live. What the output buys is the pair -- the claim in
 * the header and the ground the walk covers -- side by side.
 *
 * Measured when this was written: 65 tests build a population. Of the roots that
 * resolve statically, none was narrower than the class its header claims -- the
 * two src/scenes ones say so deliberately, and their repo-wide halves exist.
 * 19 files still resolve to nothing: their walk takes a parameter from a helper
 * defined elsewhere. That number is PRINTED rather than hidden, because a tool
 * about blindness must not understate its own.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

/**
 * A walk call with its first argument, however that argument is written.
 *
 * `path.join(...)` comes FIRST in the alternation on purpose. With the bare
 * identifier alternative first, `walk(path.join(__dirname, '..', 'scenes'))`
 * matched just `path` -- an identifier is a prefix of a member call, so the
 * cheaper branch wins and the root is lost. The self-check sample for path.join
 * is what caught it.
 */
const CALL =
  /(?:walk|walkAll|collect|sourceFiles|readdirSync)\(\s*(path\.join\([^)]*\)|['"][^'"]+['"]|[A-Za-z_$][\w$]*)/g

function testFiles() {
  const out = []
  const walk = dir => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), {
      withFileTypes: true,
    })) {
      const rel = `${dir}/${e.name}`
      if (e.isDirectory()) walk(rel)
      else if (e.name.endsWith('.test.ts')) out.push(rel)
    }
  }
  walk('src/__tests__')
  return out
}

/** Literal path fragments inside an expression, joined as a path. */
const literalsOf = expr =>
  [...expr.matchAll(/['"]([^'"]+)['"]/g)].map(m => m[1]).join('/')

/**
 * The immediately-invoked shape: `;(function walk(dir) { ... })('src')`.
 *
 * Here the root is the IIFE's own argument, nowhere near the `walk(` token, and
 * a resolver that only looks at the call site reports it unresolved. That shape
 * accounted for most of the unresolved arguments on the first run, including
 * unchecked-money-result, whose walk covers all of src.
 */
const IIFE = /\}\)\(\s*(path\.join\([^)]*\)|['"][^'"]+['"])\s*\)/g

/**
 * The walk roots of one test: a set of resolved strings, plus how many
 * arguments could not be resolved statically.
 *
 * Unresolved is reported rather than guessed. A tool that silently dropped them
 * would print a tidy list and understate its own blindness -- the failure this
 * file exists to make visible.
 */
function rootsOf(raw) {
  const roots = new Set()
  let unresolved = 0
  for (const m of raw.matchAll(IIFE)) {
    const lit = literalsOf(m[1])
    if (lit) roots.add(lit)
  }
  for (const m of raw.matchAll(CALL)) {
    const arg = m[1].trim()
    if (/^['"]/.test(arg)) {
      roots.add(arg.slice(1, -1))
      continue
    }
    if (arg.startsWith('path.join')) {
      const lit = literalsOf(arg)
      if (lit) roots.add(lit)
      else unresolved++
      continue
    }
    const def = raw.match(new RegExp(`const\\s+${arg}\\s*=\\s*([^\\n]+)`))
    if (!def) {
      unresolved++
      continue
    }
    const lit = literalsOf(def[1])
    if (lit) roots.add(lit)
    else unresolved++
  }
  return { roots: [...roots].sort(), unresolved }
}

const SAMPLES = [
  {
    why: 'a literal root is read directly',
    code: `walk('src/scenes')`,
    roots: ['src/scenes'],
    unresolved: 0,
  },
  {
    why: 'a path.join root keeps its literal parts',
    code: `walk(path.join(__dirname, '..', '..', 'scenes'))`,
    roots: ['../../scenes'],
    unresolved: 0,
  },
  {
    why: 'a variable root is resolved through its definition',
    code: `const SRC = 'src'\nwalk(SRC)`,
    roots: ['src'],
    unresolved: 0,
  },
  {
    why: 'an immediately-invoked walk keeps its argument',
    code: `;(function walk(dir) { go(dir) })('src')`,
    roots: ['src'],
    unresolved: 1,
  },
  {
    why: 'an unresolvable root is COUNTED, not dropped',
    code: `function go(dir) { walk(dir) }`,
    roots: [],
    unresolved: 1,
  },
]

function selfCheck() {
  for (const s of SAMPLES) {
    const got = rootsOf(s.code)
    if (JSON.stringify(got.roots) !== JSON.stringify(s.roots))
      throw new Error(
        `roots wrong (${s.why}): expected ${JSON.stringify(s.roots)}, got ${JSON.stringify(got.roots)}`
      )
    if (got.unresolved !== s.unresolved)
      throw new Error(
        `unresolved count wrong (${s.why}): expected ${s.unresolved}, got ${got.unresolved}`
      )
  }
  return true
}

function main() {
  selfCheck()
  console.log(`самопроверка: ${SAMPLES.length} образцов сошлись`)

  const byRoot = new Map()
  let withWalk = 0
  let unresolvedTotal = 0
  for (const f of testFiles()) {
    const { roots, unresolved } = rootsOf(
      fs.readFileSync(path.join(ROOT, f), 'utf8')
    )
    if (!roots.length && !unresolved) continue
    withWalk++
    unresolvedTotal += unresolved
    const key = roots.length ? roots.join(' | ') : '(корень не разобран)'
    if (!byRoot.has(key)) byRoot.set(key, [])
    byRoot.get(key).push(f.replace('src/__tests__/', ''))
  }

  console.log(
    `\nтестов, строящих популяцию обходом: ${withWalk}` +
      `   аргументов, не разобранных статически: ${unresolvedTotal}\n`
  )
  for (const key of [...byRoot.keys()].sort()) {
    console.log(`  КОРЕНЬ: ${key}   (${byRoot.get(key).length})`)
    for (const f of byRoot.get(key).sort()) console.log(`       ${f}`)
  }
  console.log(
    '\nузкий корень часто ВЕРЕН: charge-result-checked ходит по src/scenes' +
      '\nнарочно, а репозиторную половину класса держит unchecked-money-result' +
      '\nпо всему src. Это список для чтения, а не приговор: рядом должны' +
      '\nоказаться заявление из шапки и земля, которую обход реально покрывает.'
  )
}

if (require.main === module) main()
module.exports = { rootsOf, SAMPLES, selfCheck }
