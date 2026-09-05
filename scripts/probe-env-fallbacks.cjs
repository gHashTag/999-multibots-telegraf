#!/usr/bin/env node
/**
 * WHERE A MISSING ENVIRONMENT VARIABLE IS PAPERED OVER WITH A LITERAL.
 *
 * `process.env.X || 'something'` is usually fine -- a default page size, a
 * label, a log level. It is not fine when X names a credential, a price, an
 * identity or an endpoint, because then the literal lets the program CONTINUE
 * in a state where it should have refused.
 *
 * The form is live in this repo. inngestClient.ts builds its client with
 *
 *     eventKey: process.env.INNGEST_EVENT_KEY || ... || 'local-dev-key'
 *
 * while its twin in client.ts THROWS when no key is present. Two opposite
 * decisions about the same failure, one file apart. The older audit found the
 * same shape in money: `return 40 // Fallback price` and `costPerImage || 10`.
 *
 * This is a READING QUEUE, not a verdict. A literal fallback on a URL may be
 * the correct public default; the point is that someone must have decided so,
 * and the dangerous ones are indistinguishable from the harmless ones until
 * they are read.
 */

const fs = require('fs')
const { repoFiles } = require('./lib/repo-sources.cjs')
const path = require('path')
const { execFileSync } = require('child_process')
const { selfCheck: blankSelfCheck, matchCode } = require('./lib/blank-code.cjs')

const ROOT = path.resolve(__dirname, '..')

/**
 * `process.env.NAME` (possibly a chain of them) followed by || or ?? and a
 * LITERAL. Shared by the census and by its self-check, so the check exercises
 * the expression the numbers come from rather than a replica of it.
 *
 * Group 1 is the first env name, group 2 the whole tail, group 3 the literal.
 */
function fallbackPattern() {
  return /process\.env\.([A-Z0-9_]+)((?:\s*(?:\|\||\?\?)\s*process\.env\.[A-Z0-9_]+)*)\s*(?:\|\||\?\?)\s*('[^']*'|"[^"]*"|`[^`$]*`|-?\d+(?:\.\d+)?|true|false)/g
}

/** What the variable NAME says it holds. Order matters: first match wins. */
const CATEGORIES = [
  ['ключ/секрет', /KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|SIGNING/],
  ['деньги', /PRICE|COST|AMOUNT|STARS|BALANCE|RATE|FEE/],
  ['личность', /\bID\b|_ID|ADMIN|OWNER|CHAT|USER/],
  ['адрес', /URL|HOST|ENDPOINT|DOMAIN|PORT|WEBHOOK/],
]

function categorise(name) {
  for (const [label, re] of CATEGORIES) if (re.test(name)) return label
  return 'прочее'
}

function selfCheck() {
  blankSelfCheck()
  const fail = why => {
    console.error(`самопроверка не прошла: ${why}`)
    process.exit(2)
  }

  const hits = src => matchCode(src, fallbackPattern())

  // Positives: each accepted form, including the chain that hid the real one.
  const positives = [
    ["const k = process.env.API_KEY || 'local-dev-key'", 'API_KEY'],
    ['const n = process.env.PRICE ?? 40', 'PRICE'],
    ["const k = process.env.A_KEY || process.env.B_KEY || 'fake'", 'A_KEY'],
    ['const f = process.env.FORCE || true', 'FORCE'],
  ]
  for (const [src, wanted] of positives) {
    const m = hits(src)
    if (m.length !== 1) fail(`не распознано: ${src}`)
    if (m[0][1] !== wanted) fail(`имя переменной прочитано неверно: ${src}`)
  }

  // Negatives. Each is a DIFFERENT way to be not-a-literal-fallback; a matcher
  // that accepts any of them reports a fallback where the code already refuses
  // or already chains to another variable.
  const negatives = [
    // undefined is not a literal -- the value stays absent, which is the
    // correct shape and the one client.ts uses.
    'const k = process.env.API_KEY || undefined',
    // A chain with no literal end still refuses.
    'const k = process.env.A_KEY || process.env.B_KEY',
    // A throw is the opposite of a fallback.
    "if (!process.env.API_KEY) throw new Error('missing')",
    // Inside a string literal, not code.
    'const doc = "process.env.API_KEY || \'x\'"',
    // A different object's env-like property.
    "const k = config.env.API_KEY || 'x'",
  ]
  for (const src of negatives) {
    if (hits(src).length) fail(`принято за запасное значение: ${src}`)
  }

  // The category map, both ways. A classifier that answered the same for
  // everything would sort a credential into the catch-all bucket and hide it
  // in the tail.
  if (categorise('INNGEST_EVENT_KEY') !== 'ключ/секрет')
    fail('ключ не отнесён к секретам')
  if (categorise('DEFAULT_PRICE') !== 'деньги')
    fail('цена не отнесена к деньгам')
  if (categorise('ADMIN_CHAT_ID') !== 'личность')
    fail('идентификатор не отнесён к личности')
  if (categorise('WEBHOOK_DOMAIN') !== 'адрес')
    fail('адрес не отнесён к адресам')
  if (categorise('LOG_LEVEL') !== 'прочее')
    fail('нейтральное имя попало в опасную категорию')

  console.log(
    'самопроверка: запасные значения распознаны, отказы и цепочки отвергнуты'
  )
}

// Exported so a test can use THESE matchers rather than restating them. A test
// with its own copy of the pattern is a twin definition, and a twin whose two
// halves drift is the defect this repo keeps finding.
module.exports = { fallbackPattern, categorise, selfCheck }

if (require.main !== module) return

selfCheck()

// Tracked AND present-but-unstaged. An index-only population makes a file
// invisible until `git add`, and the verdict below then describes a tree
// that is not the one on disk (it.176 closed this for the test-side
// guards; it.190 found it still open on the probe side).
const files = repoFiles(ROOT)
  .filter(f => f.endsWith('.ts') && f.startsWith('src/'))
  .filter(f => !f.includes('__tests__') && !f.includes('/test/'))

const found = []
for (const f of files) {
  const raw = fs.readFileSync(path.join(ROOT, f), 'utf8')
  for (const m of matchCode(raw, fallbackPattern())) {
    const line = raw.slice(0, m.index).split('\n').length
    found.push({
      file: f,
      line,
      name: m[1],
      chained: !!m[2],
      literal: m[3],
      category: categorise(m[1]),
    })
  }
}

console.log(`файлов просмотрено: ${files.length}`)
console.log(
  `переменных среды с ЛИТЕРАЛЬНЫМ запасным значением: ${found.length}`
)

const byCategory = new Map()
for (const r of found) {
  if (!byCategory.has(r.category)) byCategory.set(r.category, [])
  byCategory.get(r.category).push(r)
}

// The dangerous categories first, the catch-all last: the tail is the part
// nobody needs to read, and putting it first is how a reading queue stops
// being read.
const ORDER = ['ключ/секрет', 'деньги', 'личность', 'адрес', 'прочее']
for (const cat of ORDER) {
  const rows = byCategory.get(cat)
  if (!rows || !rows.length) continue
  if (cat === 'прочее') {
    console.log(`\n=== ПРОЧЕЕ: ${rows.length} ===`)
    console.log('   (имя не обещает ни ключа, ни цены, ни личности, ни адреса)')
    continue
  }
  console.log(`\n=== ${cat.toUpperCase()}: ${rows.length} ===`)
  for (const r of rows) {
    const chain = r.chained ? ' (в конце цепочки)' : ''
    console.log(`  ${r.name} = ${r.literal}${chain}`)
    console.log(`      ${r.file}:${r.line}`)
  }
}

// A run that classified everything into the catch-all would print a clean
// report and mean the classifier stopped working, not that the repo got safer.
const dangerous = found.filter(r => r.category !== 'прочее').length
if (found.length && dangerous === 0) {
  console.error(
    '\nсамопроверка не прошла: найдены запасные значения, но НИ ОДНО не отнесено' +
      ' к опасной категории -- сломан классификатор, а не репозиторий чист.'
  )
  process.exit(2)
}
