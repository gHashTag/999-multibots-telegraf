#!/usr/bin/env node
/**
 * WHAT IS ALREADY TRACKED, AND WHERE.
 *
 * This repository ratchets defect classes: a test finds every site of a shape
 * and compares it with a written list of the ones already known. Those lists
 * are the institutional memory of the audit -- and they are invisible unless
 * you happen to open the right test.
 *
 * It cost a whole iteration to learn that. A census of "discarded money
 * results" turned up three sites, and only when the gate failed did the debt
 * list appear, whose first lines said the remaining entries were dead code and
 * asked, in as many words, not to re-inspect them each loop. Two claims nearly
 * went into a report as live money bugs.
 *
 * So: read this BEFORE censusing a class. A registry carries something a
 * text-level census cannot see -- whether the code it lists actually runs.
 *
 * The liveness column is the point. An entry that says "dead, verified #1347"
 * closes a question; an entry that just names a file re-opens it every time.
 */

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')

/** A const whose NAME says it holds known cases. */
const DECLARATION =
  /(?:const|let)\s+([A-Z][A-Z0-9_]{2,})\s*(?::[^=]+)?=\s*(?:new Set|\{|\[)/g
const REGISTRY_WORD =
  /(DEBT|ALLOW|KNOWN|EXPECTED|BASELINE|WHITELIST|EXEMPT|LEGACY|IGNORE|SKIP)/
/** Words that mean someone established whether the listed code runs. */
const LIVENESS = new RegExp(
  [
    'DEAD',
    'unreachable',
    'never (?:registered|mounted|entered|app\\.use)',
    'not (?:registered|mounted)',
    // The Russian equivalents live in string literals on purpose: the repo
    // requires code outside string literals to stay ASCII, and a regex literal
    // is code. Written as a literal here, this very line was blocked.
    'мёртв',
    'не зарегистрирован',
    'не смонтирован',
  ].join('|'),
  'i'
)

function entryList(text) {
  return [...text.matchAll(/^\s*['"]([^'"]+)['"]\s*[:,]/gm)].map(m => m[1])
}

function entriesOf(text) {
  return entryList(text).length
}

/**
 * Does "does this code run?" even apply to this registry?
 *
 * Only to one that lists CODE SITES. Several list data instead -- table names,
 * production bot usernames, code snippets quoted as strings, prose -- and for
 * those liveness is meaningless: a secret in a file nobody imports is still
 * leaked, and a table either exists or does not.
 *
 * Demanding a note there would produce annotations written to satisfy a
 * ratchet, which is worse than no note at all. Measured when the first version
 * of this probe asked for one everywhere: 15 registries were flagged, and only
 * 5 of them list code.
 */
function listsCodeSites(text) {
  return entryList(text).some(e => /\.(ts|tsx|js|cjs|mjs)$/.test(e))
}

function classOf(src) {
  const m = src.match(/describe\(\s*['"`]([^'"`]{4,90})/)
  return m ? m[1] : '?'
}

function selfCheck() {
  const fail = why => {
    console.error(`самопроверка не прошла: ${why}`)
    process.exit(2)
  }

  // The name test, both ways. The first version of this matcher required a
  // character BEFORE the keyword, so a list literally called DEBT did not
  // match and the census reported two registries instead of twenty-three.
  for (const good of ['DEBT', 'KNOWN_DEBT', 'DEAD_DISCARD_ALLOWLIST', 'EXEMPT'])
    if (!REGISTRY_WORD.test(good)) fail(`имя реестра не распознано: ${good}`)
  for (const bad of ['ROOT', 'PATTERNS', 'MODULE', 'CREDIT'])
    if (REGISTRY_WORD.test(bad))
      fail(`обычная константа принята за реестр: ${bad}`)

  if (entriesOf("  'a/b.ts': 2,\n  'c/d.ts': 1,\n") !== 2)
    fail('записи реестра посчитаны неверно')
  if (entriesOf('  someCall(),\n') !== 0)
    fail('обычный код принят за записи реестра')

  if (!listsCodeSites("  'src/a/b.ts': 1,\n"))
    fail('путь к исходнику не признан код-сайтом')
  if (listsCodeSites("  'ai_requests',\n  'avatar_videos',\n"))
    fail('имена таблиц приняты за код-сайты')

  if (!LIVENESS.test('// verified DEAD, never mounted'))
    fail('пометка о ливнесс не распознана')
  if (LIVENESS.test('// this list is sorted alphabetically'))
    fail('обычный комментарий принят за пометку о ливнесс')

  console.log('самопроверка: имена реестров и пометки о ливнесс различаются')
}

/** The whole census, as data. Exported so the ratchet uses THIS, not a copy. */
function census() {
  const files = execFileSync('git', ['ls-files'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(
      f =>
        f.endsWith('.ts') && (f.includes('__tests__') || f.includes('/tests/'))
    )
  const out = []
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
    for (const m of src.matchAll(DECLARATION)) {
      if (!REGISTRY_WORD.test(m[1])) continue
      const after = src.slice(
        m.index + m[0].length,
        m.index + m[0].length + 6000
      )
      const around = src.slice(Math.max(0, m.index - 2000), m.index + 3000)
      out.push({
        file: f,
        name: m[1],
        entries: entriesOf(after),
        codeSites: listsCodeSites(after),
        liveness: LIVENESS.test(around),
        subject: classOf(src),
      })
    }
  }
  return out.sort((a, b) => b.entries - a.entries)
}

module.exports = { census, selfCheck, REGISTRY_WORD, LIVENESS, listsCodeSites }

if (require.main !== module) return

selfCheck()

// One loop, not two: the main flow uses the same census the ratchet
// imports. The first version kept a private copy here -- a twin definition in
// the very probe written to find registries that drift.
const rows = census()

const total = rows.reduce((n, r) => n + r.entries, 0)
const codeRegistries = rows.filter(r => r.codeSites).length

console.log(`реестров: ${rows.length}, записей всего: ${total}`)
console.log(`из них перечисляют код-сайты: ${codeRegistries}\n`)

for (const r of rows) {
  const marks = [r.codeSites ? 'код' : 'данные', r.liveness ? 'ливнесс' : null]
    .filter(Boolean)
    .join(', ')
  console.log(`  ${String(r.entries).padStart(3)}  [${marks}]  ${r.name}`)
  console.log(`       ${r.file}`)
  console.log(`       предмет: ${r.subject}`)
}

// A run that finds nothing means the declaration matcher broke, not that the
// audit stopped keeping registries.
if (rows.length === 0) {
  console.error(
    '\nсамопроверка не прошла: НИ ОДНОГО реестра -- сломан матчер объявлений.'
  )
  process.exit(2)
}
