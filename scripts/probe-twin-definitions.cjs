#!/usr/bin/env node
'use strict'

/**
 * One name, more than one definition -- and at least one of them decides
 * access, price or identity.
 *
 * The shape came from a real find: two getParsingAccess, whose staff lists
 * differed by one shared account, so the difference between the dead copy and
 * the live one was a permission. Nothing had to be edited for the wider list
 * to take effect -- one import path would do it.
 *
 * A plain duplicate-name report is not useful on its own: four getBalance are
 * four provider adapters and entirely correct. What makes a twin worth reading
 * is that the name carries authority. So the report is split: everything is
 * counted, and the authority-bearing ones are listed with their files.
 *
 * This finds candidates. It cannot tell whether two bodies AGREE -- comparing
 * two implementations is reading, not matching -- so the output is a list to
 * read, never a verdict.
 */

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const {
  blank,
  selfCheck: blankSelfCheck,
  matchCode,
} = require('./lib/blank-code.cjs')

const ROOT = path.resolve(__dirname, '..')

const DEFINITION =
  /^export\s+(?:async\s+)?(?:function|const|class|enum)\s+([A-Za-z_$][\w$]*)/gm

// RE-EXPORTS ONLY. `import ... from` is deliberately excluded: a plain import
// binds a local name explicitly, so pulling two modules in creates no
// ambiguity at all. The first version accepted both, and reported
// provider-registry as a barrel holding two definitions of getBalance and
// rateLimit -- it imports the four adapters as DEFAULTS and re-exports
// nothing at all. Two of five findings were the matcher's, not the code's.
const RE_FROM =
  /export\s*(?:\*|\{[^}]*\})\s*(?:as\s+[A-Za-z_$][\w$]*\s*)?from\s*['"]([^'"]+)['"]/g

/**
 * Names that decide access, money or identity.
 *
 * Matched WORD by word, not as substrings. The first version of this was a
 * plain alternation, and `/rate/i` matched geneRATE -- generateAudio,
 * generateVideo and generateLipSync were all reported as price-bearing, three
 * of the thirty-six. A vocabulary matched by substring reports the language,
 * not the meaning.
 */
// Every named import in the repo, parsed once. Bounded to a single statement:
// this codebase omits semicolons, so a `[^;]*` form spans statements and glues
// a name from one import onto the `from` of a later one -- it reported
// calculateFinalPrice as coming from utils/logger.
const IMPORT_STATEMENT =
  /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g

const AUTHORITY_WORDS = new Set([
  'cost',
  'costs',
  'price',
  'prices',
  'pricing',
  'rate',
  'rates',
  'balance',
  'balances',
  'star',
  'stars',
  'admin',
  'admins',
  'staff',
  'access',
  'permission',
  'permissions',
  'token',
  'tokens',
  'secret',
  'secrets',
  'auth',
  'authorize',
  'limit',
  'limits',
  'owner',
  'owners',
  'refund',
  'refunds',
  'charge',
  'charges',
  'discount',
  'discounts',
  // What the server CONNECTS TO is authority too, and this half was missing.
  // helpers/downloadFile carries the SSRF redirect guard; a near-identical
  // copy in core/replicate/generateVideo did not, and the census could not see
  // the pair because no word here matched either name.
  'download',
  'downloads',
  'fetch',
  'upload',
  'uploads',
  'url',
  'urls',
  'host',
  'hosts',
  'redirect',
  'redirects',
  'webhook',
  'webhooks',
  'callback',
  'callbacks',
])

/** `calculateCostInStars` -> [calculate, cost, in, stars]; `STAR_COST` -> [star, cost]. */
function words(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_$]+/)
    .filter(Boolean)
    .map(w => w.toLowerCase())
}

const AUTHORITY = {
  test: name => words(name).some(w => AUTHORITY_WORDS.has(w)),
}

/**
 * Definitions that are NOT top-level exports: a module-local function, a
 * module-local const, or a class method. They are invisible to DEFINITION
 * above, and for an authority name that hides the most dangerous shape --
 * a private predicate nobody can see from outside.
 *
 * isAdmin is the case that forced this. The census reported two definitions;
 * there are four. The two it missed are a class method on ConfigManager and a
 * module-local function in commands/autonomousMonitor.ts -- and that last one
 * is the sole gate on ten handlers that run commands on the production server
 * as root.
 *
 * Reported as an addendum, never mixed into the twin count: these are not
 * competing exports, and a local helper sharing a name with an exported one is
 * often perfectly fine. The point is that somebody should look.
 */
function definedLocally(code, name) {
  const n = name.replace(/\$/g, '\\$')
  return [
    new RegExp(`^(?:async\\s+)?function\\s+${n}\\b`, 'm'),
    new RegExp(`^(?:const|let)\\s+${n}\\b`, 'm'),
    new RegExp(
      `^\\s+(?:public|private|protected)\\s+(?:async\\s+)?${n}\\s*\\(`,
      'm'
    ),
  ].some(re => re.test(code))
}

function definedNames(code) {
  const out = new Set()
  for (const m of blank(code).matchAll(DEFINITION)) out.add(m[1])
  return out
}

function selfCheck() {
  blankSelfCheck()
  const fail = why => {
    console.error(`самопроверка не прошла: ${why}`)
    process.exit(2)
  }

  const positive = [
    'export function calculateCost(a) {}',
    'export const STAR_COST = 0.016',
    'export async function getBalance() {}',
    'export class Pricer {}',
    'export enum Mode {}',
  ].join('\n')
  const got = definedNames(positive)
  for (const n of [
    'calculateCost',
    'STAR_COST',
    'getBalance',
    'Pricer',
    'Mode',
  ]) {
    if (!got.has(n)) fail(`определение не распознано: ${n}`)
  }

  const negative = [
    // Not definitions. Each is rejected by a different part of the pattern:
    // no `export`, a re-export rather than a definition, a type alias, an
    // indented (so not top-level) declaration, and text inside a string.
    'const localCost = 1',
    "export { calculateCost } from './x'",
    'export type CostDetails = { a: number }',
    '  export const nestedCost = 2',
    "const s = 'export const fakeCost = 3'",
  ].join('\n')
  const bad = definedNames(negative)
  const leaked = [...bad].filter(n =>
    [
      'localCost',
      'calculateCost',
      'CostDetails',
      'nestedCost',
      'fakeCost',
    ].includes(n)
  )
  if (leaked.length) fail(`принято за определение: ${leaked.join(', ')}`)

  // The classifier needs both sides too: a name with authority must match and
  // an ordinary one must not, or every twin would be reported as interesting.
  for (const yes of [
    'calculateCostInStars',
    'METAMUSE_STAFF_IDS',
    'STAR_COST',
    'processBalanceOperation',
    // The pair the vocabulary used to miss entirely.
    'downloadFile',
    'sanitizeUrl',
  ]) {
    if (!AUTHORITY.test(yes)) fail(`властное имя не распознано: ${yes}`)
  }
  for (const no of [
    'renderTemplate',
    // geneRATE contains rate, sepaRATE contains rate, and a substring matcher
    // reported all three of these as price-bearing.
    'generateAudio',
    'generateVideo',
    'separateChunks',
  ]) {
    if (AUTHORITY.test(no)) fail(`обычное имя принято за властное: ${no}`)
  }

  // The re-export matcher, on both sides. It reads the module path, which is a
  // STRING BODY -- so it runs on raw text with the blanked copy used only as a
  // mask. The first version ran on blanked code and returned zero paths, which
  // reads as "no barrel pulls two definitions" rather than as a broken matcher.
  const sample = [
    "export * from './a'",
    "export { x } from './b'",
    // A plain import is NOT a re-export and must not count: it binds a local
    // name, so two of them cannot make a consumer receive the wrong copy.
    "import { y } from './c'",
    "import z from './d'",
    "// export * from './commented'",
  ].join('\n')
  const sampleMask = blank(sample)
  const seen = []
  for (const m of sample.matchAll(RE_FROM)) {
    if (sampleMask[m.index] === ' ') continue
    seen.push(m[1])
  }
  if (seen.join(',') !== './a,./b') {
    fail(`реэкспорты разобраны как ${JSON.stringify(seen)}`)
  }

  // Both sides for the local matcher too.
  const localYes = [
    'function isAdmin(userId) {}',
    'const isAdmin = 1',
    '  public isAdmin(id) {}',
  ]
  for (const y of localYes) {
    if (!definedLocally(y, 'isAdmin'))
      fail(`локальное определение пропущено: ${y}`)
  }
  // One negative PER BRANCH. A first version had a longer-name sample only for
  // the const branch, so dropping the boundary from the function branch
  // survived: nothing in the list could tell isAdminReally from isAdmin there.
  const localNo = [
    'if (isAdmin(x)) {}',
    'const isAdminReally = 1',
    'function isAdminReally() {}',
    '  public isAdminReally(id) {}',
    "const s = 'function isAdmin() {}'",
  ]
  for (const nn of localNo) {
    if (definedLocally(blank(nn), 'isAdmin')) {
      fail(`принято за локальное определение: ${nn}`)
    }
  }

  // The importer matcher, both ways. A counter that always returned zero would
  // rank every name equally and quietly report "nothing worth reading" -- the
  // failure this ranking exists to prevent, and one I actually produced: in a
  // shell one-liner the escaping turned the word boundary into a literal and
  // every count came back zero.
  // The import statement parser. This codebase omits semicolons, so a matcher
  // bounded by `;` runs past the end of one statement into the next and pairs a
  // name with the wrong module -- measured, not hypothetical.
  const twoImports = "import { alpha } from './a'\nimport { beta } from './b'\n"
  const parsed = matchCode(twoImports, IMPORT_STATEMENT).map(m => [
    m[1].trim(),
    m[2],
  ])
  if (parsed.length !== 2) fail('разбор импортов не нашёл оба выражения')
  if (parsed[0][1] !== './a' || parsed[1][1] !== './b')
    fail('имя связано не со своим модулем')

  const importSample = "import { alpha, beta as gamma } from './x'"
  const hits = n => matchCode(importSample, importPattern(n)).length
  if (!hits('alpha')) fail('импортируемое имя не распознано')
  if (!hits('beta')) fail('имя перед as не распознано')
  if (hits('alph')) fail('приставка имени принята за импорт')
  // Each boundary needs its own negative: the trailing \b rejects a prefix,
  // the leading one rejects a suffix. With only the prefix sample, dropping
  // the leading \b passed this check -- measured, not assumed.
  if (hits('lpha')) fail('окончание имени принято за импорт')
  if (hits('delta')) fail('отсутствующее имя найдено среди импортов')

  console.log(
    'самопроверка: определения разобраны, посторонние формы отвергнуты'
  )
}

selfCheck()

const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter(
    f => f.startsWith('src/') && f.endsWith('.ts') && !f.includes('__tests__')
  )

const fileSet = new Set(files)

const where = new Map()
const blanked = {}
const rawSources = {}
for (const f of files) {
  let code
  try {
    code = fs.readFileSync(path.join(ROOT, f), 'utf8')
  } catch {
    continue
  }
  rawSources[f] = code
  blanked[f] = blank(code)
  for (const n of definedNames(code)) {
    if (!where.has(n)) where.set(n, [])
    where.get(n).push(f)
  }
}

/**
 * The dangerous subclass: ONE barrel re-exports more than one definition of the
 * same name. Then which copy a consumer receives is decided by the barrel's
 * internal ordering, not by the import.
 *
 * That is not hypothetical. src/navigation/index.ts re-exports
 * HAIM_GROUP_STAFF_IDS from config/access.config and, via `export *`, also
 * pulls the copy in constants/access -- which holds ['123456789','987654321'],
 * placeholder ids nobody replaced. Measured on a fixture of the same shape:
 * with the stars in the other order, the placeholder is what production gets.
 * Two live authorization checks read that name.
 */

/** './config/access.config' from src/navigation/index.ts -> src/navigation/config/access.config.ts */
function resolveFrom(fromFile, spec) {
  if (!spec.startsWith('.')) return null
  const base = path.posix.join(path.posix.dirname(fromFile), spec)
  for (const cand of [`${base}.ts`, `${base}/index.ts`]) {
    if (fileSet.has(cand)) return cand
  }
  return null
}

const reExportTargets = new Map()
for (const f of files) {
  let raw
  try {
    raw = fs.readFileSync(path.join(ROOT, f), 'utf8')
  } catch {
    continue
  }
  // Matched on the RAW text, not the blanked one: the module path IS a string
  // body, and blank() erases exactly that. The first version of this pass ran
  // on blanked code and reported zero -- with a known positive in hand.
  //
  // blank() promises byte-for-byte offsets, so the blanked copy is still
  // usable as a mask: if the statement starts where the mask has a space, the
  // whole statement was inside a comment and does not count.
  const mask = blank(raw)
  const targets = new Set()
  for (const m of raw.matchAll(RE_FROM)) {
    if (mask[m.index] === ' ') continue
    const r = resolveFrom(f, m[1])
    if (r) targets.add(r)
  }
  if (targets.size) reExportTargets.set(f, targets)
}

function ambiguousBarrels(definingFiles) {
  const out = []
  for (const [barrel, targets] of reExportTargets) {
    const hit = definingFiles.filter(d => targets.has(d) && d !== barrel)
    if (hit.length > 1) out.push([barrel, hit])
  }
  return out
}

/**
 * How many files IMPORT a name.
 *
 * The census sorted by definition count, and that ranking is close to useless:
 * of 33 authority twins, 17 have no importer at all. A name defined five times
 * and imported nowhere is noise; a name defined twice and imported eleven times
 * is where a divergence would actually be felt.
 *
 * The vocabulary finds names. Danger lives in consumers, so the report is
 * ordered by them.
 */
// Shared by importerCount and by its self-check, so the check exercises the
// real expression rather than a replica of it.
function importPattern(name) {
  return new RegExp(
    'import\\s*(?:type\\s*)?\\{[^}]*\\b' +
      name.replace(/\$/g, '\\$') +
      '\\b[^}]*\\}',
    'g'
  )
}

function importerCount(name) {
  const re = importPattern(name)
  let n = 0
  for (const [f, raw] of Object.entries(rawSources)) {
    if (where.get(name) && where.get(name).includes(f)) continue
    if (matchCode(raw, re).length) n++
  }
  return n
}

/**
 * Two spellings of one barrel are not two definitions. Grouping consumers by
 * the module STRING reported calculateFinalPrice as split four ways when every
 * consumer lands on the same file, so specifiers are resolved to files first.
 */
const existsFile = f => fileSet.has(f)

function resolveModule(fromFile, spec) {
  let base
  if (spec.startsWith('@/')) base = path.join('src', spec.slice(2))
  else if (spec.startsWith('.'))
    base = path.normalize(path.join(path.dirname(fromFile), spec))
  else return null // a package, not ours
  for (const c of [base + '.ts', path.join(base, 'index.ts')])
    if (existsFile(c)) return c
  return null
}

/** One hop through a barrel: which file does THIS name really come from. */
function followReexport(file, name) {
  if (!file || !rawSources[file]) return file
  const src = rawSources[file]
  for (const m of matchCode(
    src,
    /export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g
  )) {
    const listed = m[1].split(',').map(x =>
      x
        .trim()
        .split(/\s+as\s+/)
        .pop()
        .trim()
    )
    if (listed.includes(name)) {
      const r = resolveModule(file, m[2])
      if (r) return r
    }
  }
  // `export * from './x'` is the common form here; follow it only to a file
  // that actually defines the name, so a star that re-exports something else
  // does not capture the consumer.
  for (const m of matchCode(src, /export\s*\*\s*from\s*['"]([^'"]+)['"]/g)) {
    const r = resolveModule(file, m[1])
    if (r && rawSources[r] && DEFINES(rawSources[r], name)) return r
  }
  return file
}

/** Does this source define the name at top level (not merely mention it)? */
function DEFINES(src, name) {
  return new RegExp(
    'export\\s+(?:async\\s+)?(?:function|const|class|type|interface|enum)\\s+' +
      name.replace(/\$/g, '\\$') +
      '\\b'
  ).test(src)
}

function importsIn(file) {
  const out = []
  for (const m of matchCode(rawSources[file], IMPORT_STATEMENT)) {
    out.push({
      names: m[1].split(',').map(x =>
        x
          .trim()
          .split(/\s+as\s+/)[0]
          .trim()
      ),
      mod: m[2],
    })
  }
  return out
}

/** name -> Map(resolved definition file -> consumer count) */
function consumerSplit(name) {
  const by = new Map()
  for (const f of Object.keys(rawSources)) {
    for (const i of importsIn(f)) {
      if (!i.names.includes(name)) continue
      const r = followReexport(resolveModule(f, i.mod), name)
      if (!r) continue
      by.set(r, (by.get(r) || 0) + 1)
    }
  }
  return by
}

const twins = [...where.entries()].filter(([, v]) => v.length > 1)
const authority = twins.filter(([n]) => AUTHORITY.test(n))

console.log(`файлов: ${files.length}, экспортируемых имён: ${where.size}`)
console.log(`определены больше чем в одном файле: ${twins.length}`)
console.log(
  `\n=== ИЗ НИХ ВЛАСТНЫЕ (доступ / цена / личность): ${authority.length} ===`
)
console.log('   (список для чтения, не вердикт: две копии могут и совпадать)\n')

const ranked = authority
  .map(([name, fileList]) => [name, fileList, importerCount(name)])
  .sort(
    (a, b) =>
      b[2] - a[2] || b[1].length - a[1].length || a[0].localeCompare(b[0])
  )

const unread = ranked.filter(r => r[2] === 0).length
console.log(`   из них никто не импортирует: ${unread} -- их можно не читать\n`)
for (const [name, fileList, consumers] of ranked) {
  console.log(`  ${name}  (${fileList.length} опред., ${consumers} импортёров)`)
  for (const f of fileList.sort()) console.log(`      ${f}`)
}

// The sharpest question is not how many copies exist but whether consumers
// DISAGREE about which one they get. calculateModeCost has three definitions
// and all nine consumers land on one file; that is a non-finding. A name whose
// consumers land on two different files is where a rename, a price change or an
// access rule reaches only half of them.
// The authority dictionary is itself a matcher that knows spellings, not
// things: a name it never learned is invisible to it. --all drops the
// dictionary entirely and asks the only question that needs no vocabulary --
// do this name's consumers land on more than one file.
const ALL = process.argv.includes('--all')
const splitPopulation = ALL ? twins : ranked

const splits = []
for (const [name] of splitPopulation) {
  const by = consumerSplit(name)
  if (by.size > 1) splits.push([name, by])
}
console.log(`\n=== ПОТРЕБИТЕЛИ РАСХОДЯТСЯ ПО ФАЙЛАМ: ${splits.length} ===`)
console.log(
  '   (правка одной копии дойдёт не до всех -- это и есть список на чтение)\n'
)
for (const [name, by] of splits) {
  console.log(`  ${name}`)
  for (const [file, n] of [...by].sort((a, b) => b[1] - a[1]))
    console.log(`      ${file}  <- ${n}`)
}

// A resolution pass that resolves nothing prints "0 barrels pull two
// definitions", which is indistinguishable from good news. This repo has
// barrels; if none resolved, the path mapping is broken, not the code clean.
if (reExportTargets.size === 0) {
  console.error(
    'самопроверка не прошла: ни одна бочка не разрешилась -- сломано сопоставление путей.'
  )
  process.exit(2)
}

const ambiguous = authority
  .map(([name, fileList]) => [name, ambiguousBarrels(fileList)])
  .filter(([, b]) => b.length)

console.log(`\n=== ОДНА БОЧКА ТЯНЕТ ДВА ОПРЕДЕЛЕНИЯ: ${ambiguous.length} ===`)
console.log(
  '   (какую копию получит потребитель, решает ПОРЯДОК внутри бочки)\n'
)
for (const [name, barrelList] of ambiguous) {
  for (const [barrel, hit] of barrelList) {
    console.log(`  ${name}  <- ${barrel}`)
    for (const h of hit) console.log(`      ${h}`)
  }
}

// Addendum: authority names that ALSO have a definition no export reveals.
const hidden = []
for (const [name] of authority) {
  const extra = []
  for (const [f, code] of Object.entries(blanked)) {
    if (where.get(name).includes(f)) continue
    if (definedLocally(code, name)) extra.push(f)
  }
  if (extra.length) hidden.push([name, extra])
}

console.log(`\n=== ПЛЮС ОПРЕДЕЛЕНИЯ БЕЗ ЭКСПОРТА: ${hidden.length} ===`)
console.log(
  '   (локальная функция, локальная константа или метод класса -- снаружи не видно)\n'
)
for (const [name, fileList] of hidden) {
  console.log(`  ${name}  (+${fileList.length})`)
  for (const f of fileList.sort()) console.log(`      ${f}`)
}

const ordinary = twins.length - authority.length
console.log(`\nостальные двойники: ${ordinary}`)
console.log('   (имя не решает доступ, цену или личность -- читать по случаю)')
