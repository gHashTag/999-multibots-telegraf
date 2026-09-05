#!/usr/bin/env node
'use strict'

/**
 * An Inngest event is a trust boundary, and the question is not how the code
 * reads it but WHERE the value lands.
 *
 * Reading `event.data` without a schema is ordinary and mostly harmless. It
 * matters when an unvalidated field reaches a sink: a filesystem path, a shell
 * command, or a balance operation. That intersection is what produced the
 * findings in #1772, #1777 and #1779.
 *
 * REGISTERED functions only. A file on disk that nothing serves cannot be
 * reached by any event, and including it makes the report demand guards in
 * dead code -- which happened when the population was taken from the directory
 * instead of the served array (#1779). Unserved files are counted separately
 * so they are visible without being claimed.
 */

const fs = require('fs')
const { repoFiles } = require('./lib/repo-sources.cjs')
const path = require('path')
const { execFileSync } = require('child_process')
const {
  blank,
  matchCode,
  selfCheck: blankSelfCheck,
} = require('./lib/blank-code.cjs')

const ROOT = path.resolve(__dirname, '..')
const REGISTRY = 'src/inngest_app/registerFunctions.ts'

/** Sinks worth naming, matched as CALLS rather than as words. */
const SINKS = [
  ['путь', /path\.join\s*\(/, 'path.join(a)'],
  ['оболочка', /\b(execSync|exec)\s*\(|\w*ssh\w*\.exec\s*\(/, 'exec(cmd)'],
  [
    'деньги',
    /(updateUserBalance|processBalanceOperation|setPayments)\s*\(/,
    'updateUserBalance(x)',
  ],
]

const readsEventData = code => /event\.data/.test(code)
// JSON.parse is not schema validation, and counting it as such EXCLUDES the
// file from the report -- the direction that hides risk rather than inventing
// it. Removed before matching, because the receiver is what distinguishes
// them and a bare /\.parse\(/ cannot see it.
const hasSchemaParse = code =>
  /\.(safeParse|parse)\s*\(/.test(code.replace(/JSON\.parse\s*\(/g, ''))

/** Files reachable through the served array, resolved from the registry. */
/**
 * Names actually listed in the served array.
 *
 * Blanked first, rather than filtering lines that start with `//`. That filter
 * was redundant -- the line pattern below already rejects a line beginning
 * with a slash, so no mutation could kill it -- and it missed the case it
 * looked like it covered: an entry inside a BLOCK comment sits on its own line
 * with no marker at all.
 */
function servedNames(registrySource) {
  return new Set(
    blank(registrySource)
      .split('\n')
      .filter(l => /^\s+[A-Za-z_$][\w$]*,\s*$/.test(l))
      .map(l => l.trim().replace(/,$/, ''))
  )
}

function registeredFiles(registrySource) {
  const served = servedNames(registrySource)
  const out = []
  for (const m of matchCode(
    registrySource,
    /^import\s*\{([^}]*)\}\s*from\s*'(\.[^']*)'/gm
  )) {
    const names = m[1]
      .split(',')
      .map(n =>
        n
          .trim()
          .split(/\s+as\s+/)
          .pop()
          .trim()
      )
      .filter(Boolean)
    if (!names.some(n => served.has(n))) continue
    const rel = path.posix.join('src/inngest_app', m[2].replace(/^\.\//, ''))
    for (const cand of [`${rel}.ts`, `${rel}/index.ts`]) {
      if (fs.existsSync(path.join(ROOT, cand))) {
        out.push(cand)
        break
      }
    }
  }
  return [...new Set(out)]
}

function selfCheck() {
  blankSelfCheck()
  const fail = why => {
    console.error(`самопроверка не прошла: ${why}`)
    process.exit(2)
  }

  // A commented-out entry is present in the file and absent from the runtime.
  // Taking it as served is exactly the mistake that made the previous version
  // demand a guard in code nothing runs.
  const sample = [
    "import { alpha } from './functions/a'",
    "import { beta } from './functions/b'",
    "import { gamma } from './functions/c'",
    "import { delta } from './functions/d'",
    'export const functions = [',
    '  alpha,',
    '  // beta,',
    '  /*',
    '  delta,',
    '  */',
    ']',
  ].join('\n')
  // Test the SERVED-NAME parsing directly. A first version asserted that
  // registeredFiles(sample) came back empty -- which it did, but only because
  // the sample paths do not exist on disk. It was empty whether or not the
  // commented-out entry was counted, so it could not fail, and a mutation
  // removing the comment filter sailed through it.
  const served = servedNames(sample)
  if (!served.has('alpha')) fail('поданное имя не распознано')
  if (served.has('beta')) fail('закомментированная запись принята за поданную')
  if (served.has('gamma')) fail('имя вне массива принято за поданное')
  // A block-commented entry carries no marker on its own line, which is why
  // the source is blanked rather than line-filtered.
  if (served.has('delta'))
    fail('запись в блочном комментарии принята за поданную')
  const got = registeredFiles(sample)
  if (got.length !== 0) {
    fail(`несуществующие пути разрешились: ${JSON.stringify(got)}`)
  }

  if (!readsEventData('const { a } = event.data'))
    fail('чтение события не распознано')
  if (readsEventData('const a = eventual.database'))
    fail('похожее имя принято за event.data')
  if (!hasSchemaParse('Schema.safeParse(x)')) fail('safeParse не распознан')
  if (!hasSchemaParse('Schema.parse(x)')) fail('parse не распознан')
  // JSON.parse is not schema validation, and it is the obvious false positive.
  if (hasSchemaParse('JSON.parse(body)'))
    fail('JSON.parse принят за разбор схемой')

  // Each sink carries its own positive sample, so the label stays a string
  // literal and the sample cannot drift away from the pattern it proves.
  for (const [name, re, sample] of SINKS) {
    if (!re.test(sample)) fail(`сток не распознан: ${name}`)
  }
  // The word is not the call: a mention in a comment must not count as money.
  if (SINKS[2][1].test('// refund handled elsewhere')) {
    fail('слово в комментарии принято за денежный вызов')
  }
  console.log(
    'самопроверка: реестр и стоки разобраны, посторонние формы отвергнуты'
  )
}

selfCheck()

const registrySource = fs.readFileSync(path.join(ROOT, REGISTRY), 'utf8')
const registered = new Set(registeredFiles(registrySource))

// Tracked AND present-but-unstaged. An index-only population makes a file
// invisible until `git add`, and the verdict below then describes a tree
// that is not the one on disk (it.176 closed this for the test-side
// guards; it.190 found it still open on the probe side).
const all = repoFiles(ROOT).filter(
  f =>
    f.startsWith('src/inngest_app/functions/') &&
    f.endsWith('.ts') &&
    !f.includes('__tests__')
)

const rows = []
let readers = 0
let unservedReaders = 0
for (const f of all) {
  let code
  try {
    code = blank(fs.readFileSync(path.join(ROOT, f), 'utf8'))
  } catch {
    continue
  }
  if (!readsEventData(code)) continue
  readers++
  if (!registered.has(f)) {
    unservedReaders++
    continue
  }
  if (hasSchemaParse(code)) continue
  const hit = SINKS.filter(([, re]) => re.test(code)).map(([n]) => n)
  if (hit.length) rows.push([f, hit])
}

console.log(`\nзарегистрированных функций: ${registered.size}`)
console.log(
  `читают event.data: ${readers} (из них не подаются: ${unservedReaders})`
)
console.log(`\n=== ПОДАЁТСЯ, БЕЗ СХЕМЫ, СО СТОКОМ: ${rows.length} ===`)
console.log('   (список для чтения: сток -- ещё не дефект, но адрес)\n')
for (const [f, hit] of rows.sort()) {
  console.log(
    `  ${f.replace('src/inngest_app/functions/', '')}  [${hit.join(', ')}]`
  )
}
