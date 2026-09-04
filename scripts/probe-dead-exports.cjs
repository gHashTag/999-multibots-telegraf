#!/usr/bin/env node
/**
 * READ-ONLY. Symbols a barrel re-exports that nobody imports.
 *
 * Why this is not the same question as reachability. probe-reachability walks
 * FILES from the entry points, and a file imported by a barrel counts as
 * reached -- even when not one of its symbols is used. That is how
 * cleanupOldArchives stayed invisible: `core/supabase/index.ts` re-exports it,
 * so the file is reachable, while the function itself is called nowhere. It
 * deletes user training archives, and its date comparison is unsafe; harmless
 * only because nothing calls it.
 *
 * Dead code is where defects accumulate without resistance: nobody sees them,
 * because they break nothing -- until someone wires the symbol up.
 *
 * Two answers are reported separately. Never imported ANYWHERE is dead. Imported
 * only by tests is milder: the test keeps it compiling and proves nothing about
 * the product.
 *
 * Nothing is written and no network is used.
 */
const fs = require('fs')
const path = require('path')
const readCensus = require('./lib/read-census.cjs').census
const scan = readCensus('исходники')
const { execFileSync } = require('child_process')

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim()

/**
 * Blank comments and string CONTENTS, keeping BOTH quotes.
 *
 * The first version replaced the closing quote with a space too, so every
 * `export { x } from '...'` line stopped matching and the census silently
 * reported half the truth -- 150 re-exports where there are 281. Caught only by
 * checking one symbol known to be dead and finding it absent.
 */
// The blanker lives in scripts/lib/blank-code.cjs now. It was written five
// times across five probes, and one of those copies -- this one -- ate a
// string's closing quote and halved the census. One definition, one set of
// controls, mutated in place.
const { blank, selfCheck: blankSelfCheck } = require('./lib/blank-code.cjs')

const RE_REEXPORT = /export\s*\{([^}]*)\}\s*from\s*['"]([^'"]*)['"]/g
// A symbol arrives two ways, and counting only the static form OVER-reports
// death. `getAllButtonTexts` was filed as imported-only-by-tests while
// core/supabase/getTranslation.ts really uses it as
//   const { getAllButtonTexts } = await import('@/navigation')
// There are 319 such destructuring sites in prod, so the form is ordinary, not
// exotic. The second branch requires the `import(`/`require(` call itself:
// plain destructuring off an object is not an import and must not count.
const importsByName = name => {
  const n = name.replace(/\$/g, '\\$')
  return new RegExp(
    'import\\s*(?:type\\s*)?\\{[^}]*\\b' +
      n +
      '\\b[^}]*\\}' +
      '|\\{[^}]*\\b' +
      n +
      '\\b[^}]*\\}\\s*=\\s*(?:await\\s+)?(?:import|require)\\s*\\('
  )
}

/** Re-exported symbol names in one blanked source. */
function reExported(code) {
  const out = new Set()
  for (const m of code.matchAll(RE_REEXPORT)) {
    for (const raw of m[1].split(',')) {
      const n = raw
        .trim()
        .split(/\s+as\s+/)
        .pop()
        .trim()
      if (/^[A-Za-z_$][\w$]*$/.test(n)) out.add(n)
    }
  }
  return [...out]
}

/**
 * POSITIVE CONTROL: a barrel line exactly as they are written here, including
 * the quoted path. This is the case the broken blank() lost -- if it regresses,
 * the census reports a comfortably small number and nothing looks wrong.
 *
 * NEGATIVE CONTROL: shapes that are not re-exports, each rejected by a
 * different part of the pattern -- a local declaration, and an IMPORT naming
 * the same symbol.
 */
const C_POS = "export { alpha, beta as gamma } from './some/path'"
const C_NEG = ['const alpha = 1', "import { delta } from './x'"].join('\n')

function selfCheck() {
  const pos = reExported(blank(C_POS))
  if (!pos.includes('alpha') || !pos.includes('gamma') || pos.length !== 2) {
    console.error(
      'самопроверка не прошла: строка реэкспорта разобрана как ' +
        JSON.stringify(pos) +
        '.\n' +
        'счёт ниже был бы занижен, и это выглядело бы как «мёртвого кода мало».'
    )
    process.exit(2)
  }
  const neg = reExported(blank(C_NEG))
  if (neg.length !== 0) {
    console.error(
      'самопроверка не прошла: за реэкспорт принято ' +
        JSON.stringify(neg) +
        '.'
    )
    process.exit(2)
  }
  for (const yes of [
    "import { delta } from './x'",
    "const { delta } = await import('./x')",
    "const { delta } = require('./x')",
  ]) {
    if (!importsByName('delta').test(yes)) {
      console.error('самопроверка не прошла: импорт не распознан — ' + yes)
      process.exit(2)
    }
  }
  // Both boundaries, not one. A mutation that removed only the LEADING \b
  // survived the first version of this check, because the trailing one still
  // rejected `deltaX`; nothing rejected `xdelta`.
  for (const near of [
    "import { deltaX } from './x'",
    "import { xdelta } from './x'",
    "const { deltaX } = await import('./x')",
    "const { xdelta } = await import('./x')",
    // Destructuring off a plain object is not an import. Without this sample a
    // matcher that dropped the call would count every `const { x } = obj`.
    'const { delta } = someObject',
  ]) {
    if (importsByName('delta').test(near)) {
      console.error(
        'самопроверка не прошла: похожее имя принято за импорт — ' + near
      )
      process.exit(2)
    }
  }
  blankSelfCheck()
  console.log('самопроверка: реэкспорт разобран, посторонние формы отвергнуты')
}

selfCheck()

const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter(f => f.startsWith('src/') && f.endsWith('.ts'))

const isTest = f => f.includes('__tests__') || f.includes('/test/')
const prod = {}
const tests = {}
for (const f of files) {
  // A swallowed read made this probe print a confident 0 while reading
  // nothing: the count described the file list, not the work.
  const raw = scan.read1(path.join(ROOT, f))
  if (raw === null) continue
  ;(isTest(f) ? tests : prod)[f] = blank(raw)
}
scan.report(files.length)

const barrels = {}
for (const [f, code] of Object.entries(prod)) {
  const names = reExported(code)
  if (names.length) barrels[f] = names
}

const usedIn = (name, corpus, skip) => {
  const rx = importsByName(name)
  return Object.entries(corpus).some(([f, s]) => f !== skip && rx.test(s))
}

const dead = []
const testOnly = []
for (const [barrel, names] of Object.entries(barrels)) {
  for (const n of names) {
    if (usedIn(n, prod, barrel)) continue
    ;(usedIn(n, tests) ? testOnly : dead).push([barrel, n])
  }
}

const total = Object.values(barrels).reduce((s, v) => s + v.length, 0)
console.log(`бочек: ${Object.keys(barrels).length}, реэкспортов: ${total}`)
console.log(`\n=== НЕ ИМПОРТИРУЕТСЯ НИГДЕ: ${dead.length} ===`)
console.log('   (мёртвая поверхность: тут дефекты копятся, ничего не ломая)\n')
const byBarrel = new Map()
for (const [b, n] of dead) {
  if (!byBarrel.has(b)) byBarrel.set(b, [])
  byBarrel.get(b).push(n)
}
for (const [b, ns] of [...byBarrel.entries()].sort(
  (a, c) => c[1].length - a[1].length
)) {
  console.log(`  ${b}  (${ns.length})`)
  for (const n of ns.sort()) console.log(`      ${n}`)
}
console.log(`\nимпортируется ТОЛЬКО тестами: ${testOnly.length}`)
console.log(
  '   (тест держит символ компилируемым и ничего не говорит о продукте)'
)
