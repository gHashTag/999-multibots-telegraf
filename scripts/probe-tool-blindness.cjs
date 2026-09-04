#!/usr/bin/env node
/**
 * READ-ONLY. Сколько файлов НЕ видят мои же инструменты.
 *
 * Вчера выяснилось: осмотр репозитория на секреты видел на 50 файлов меньше,
 * чем думал. `git ls-files` без `-z` экранирует не-ASCII имена, файл не
 * открывается, проверка существования его отбрасывает — и он молча выпадает.
 * В четырёх выпавших лежал рабочий служебный ключ базы.
 *
 * Молчаливая слепота инструмента дороже ненайденного дефекта: она обесценивает
 * ВСЕ выводы, сделанные этим инструментом. Поэтому здесь считается знаменатель
 * для каждого обхода: сколько файлов существует, сколько инструмент откроет,
 * сколько отбросит и почему.
 *
 * Ничего не пишет.
 */
const fs = require('fs')
const path = require('path')
const { matchCode } = require('./lib/blank-code.cjs')
const { execSync } = require('child_process')

/** Нулевой байт — признак двоичного файла. Записан кодом, а не буквально. */
const NUL = String.fromCharCode(0)

/** Всё, что есть на диске, без служебных каталогов. */
function onDisk(root = '.') {
  const out = []
  const SKIP = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    'coverage',
  ])
  ;(function walk(dir) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (SKIP.has(e.name)) continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.isFile()) out.push(p.replace(/^\.\//, ''))
    }
  })(root)
  return out
}

const disk = onDisk()
const diskSet = new Set(disk)

console.log(`файлов на диске (без node_modules и .git): ${disk.length}\n`)

// --- 1. git ls-files: с экранированием и без ---------------------------
console.log('=== Перечисление через git ===')
const plain = execSync('git ls-files', { encoding: 'utf8', maxBuffer: 1 << 26 })
  .split('\n')
  .filter(Boolean)
const zero = execSync('git ls-files -z', {
  encoding: 'utf8',
  maxBuffer: 1 << 26,
})
  .split('\0')
  .filter(Boolean)

const plainMissing = plain.filter(f => !fs.existsSync(f))
const zeroMissing = zero.filter(f => !fs.existsSync(f))

console.log(
  `  git ls-files      : ${plain.length} имён, НЕ открывается ${plainMissing.length}`
)
console.log(
  `  git ls-files -z   : ${zero.length} имён, НЕ открывается ${zeroMissing.length}`
)
if (plainMissing.length) {
  console.log('  примеры выпавших:')
  for (const f of plainMissing.slice(0, 3)) console.log(`    ${f.slice(0, 76)}`)
}

// --- 2. Файлы с не-ASCII именами ---------------------------------------
const nonAscii = disk.filter(f => /[^\x20-\x7e]/.test(f))
console.log(`\n  файлов с не-ASCII именами на диске: ${nonAscii.length}`)
const nonAsciiTs = nonAscii.filter(f => f.endsWith('.ts'))
console.log(
  `  из них .ts (то есть попадают в обходы src): ${nonAsciiTs.length}`
)

// --- 3. Что видят обходы каталогов -------------------------------------
//
// Все мои искалки ходят по src через readdirSync — экранирование им не грозит.
// Но у них другие фильтры, и их стоит назвать вслух.
console.log('\n=== Обходы каталога src ===')
const srcAll = disk.filter(f => f.startsWith('src/'))
const srcTs = srcAll.filter(f => f.endsWith('.ts'))
const srcTsx = srcAll.filter(f => f.endsWith('.tsx'))
const srcOther = srcAll.filter(f => !f.endsWith('.ts') && !f.endsWith('.tsx'))
console.log(`  всего файлов в src: ${srcAll.length}`)
console.log(`    .ts   ${srcTs.length}   ← это и осматривают искалки`)
console.log(`    .tsx  ${srcTsx.length}   ← НЕ осматривает никто`)
console.log(`    прочее ${srcOther.length}`)
const byExt = {}
for (const f of srcOther) {
  const ext = path.extname(f) || '(без расширения)'
  byExt[ext] = (byExt[ext] || 0) + 1
}
console.log(
  `    из прочего: ${Object.entries(byExt)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, v]) => `${k}:${v}`)
    .join('  ')}`
)

// --- 4. Нечитаемые файлы ------------------------------------------------
console.log('\n=== Файлы, которые не прочитать как текст ===')
let unreadable = 0
let binary = 0
let big = 0
for (const f of srcTs) {
  try {
    const st = fs.statSync(f)
    if (st.size > 2 * 1024 * 1024) big++
    const text = fs.readFileSync(f, 'utf8')
    if (text.includes(NUL)) binary++
  } catch {
    unreadable++
  }
}
console.log(
  `  из ${srcTs.length} файлов .ts: не читаются ${unreadable}, двоичных ${binary}, больше 2 МБ ${big}`
)

/**
 * The three blindness marks, callable on a sample.
 *
 * They were inline in the loop, so this probe -- whose whole subject is tools
 * that go silently blind -- could not be pointed at a known case itself. If one
 * of these patterns stopped matching, the count would fall to zero and read as
 * "the tools got better".
 */
/**
 * Matched on CODE, not on raw text.
 *
 * Every rule here is about what a tool DOES, so a file that explains the rule
 * in prose must not be flagged for quoting it. Two of sixteen suspects were
 * exactly that: scripts/lib/read-census.cjs, whose doc-comment quotes the
 * forbidden shape while describing why it is forbidden, and the guard
 * no-silent-blindness.test.ts, which does the same. This is the third file in
 * this family to trip over its own documentation, and the cure is the same as
 * for the others -- matchCode drops any hit that BEGINS inside a comment or a
 * string body.
 */
const RULES = [
  [/execSync\(\s*['"`]git ls-files['"`]/g, 'git ls-files без -z'],
  [
    /catch\s*(\([^)]*\))?\s*\{\s*(continue|return)\s*\}/g,
    'молчаливый пропуск при ошибке чтения',
  ],
  [
    /if\s*\(!fs\.existsSync\([^)]*\)\)\s*continue/g,
    'пропуск несуществующего без счётчика',
  ],
]

function flagsFor(text) {
  return RULES.filter(([re]) => matchCode(text, re).length > 0).map(r => r[1])
}

/**
 * POSITIVE CONTROL: all three marks at once.
 *
 * NEGATIVE CONTROL: the corrected form of each, one per mark, so no single
 * pattern going wrong can hide behind another. -z makes the enumeration safe;
 * a catch that says something is not a silent skip; and a skip that counts what
 * it dropped is not a silent one either.
 */
const C_POS = [
  "execSync('git ls-files')",
  'try { read() } catch { continue }',
  'if (!fs.existsSync(p)) continue',
].join('\n')

const C_NEG = [
  "execSync('git ls-files -z')",
  'try { read() } catch (e) { logger.warn(e); continue }',
  'if (!fs.existsSync(p)) { missing++; continue }',
  // PROSE. A file explaining the rule must not be flagged for quoting it.
  // Two of sixteen suspects were exactly this, and both were the files that
  // document the rule -- including the fix written for it one iteration
  // earlier.
  '// the old code swallowed it with catch { continue }',
  '/* forbidden shape: catch { return } */',
  "const doc = 'if (!fs.existsSync(p)) continue'",
].join('\n')

const posFlags = flagsFor(C_POS)
if (posFlags.length !== 3) {
  console.error(
    `самопроверка не прошла: из трёх заведомых признаков слепоты найдено ${posFlags.length}.\n` +
      'ноль подозреваемых ниже означал бы сломанный матчер, а не исправные инструменты.'
  )
  process.exit(2)
}
const negFlags = flagsFor(C_NEG)
if (negFlags.length !== 0) {
  console.error(
    `самопроверка не прошла: матчер пометил исправные формы или прозу (${negFlags.join('; ')}).`
  )
  process.exit(2)
}
console.log(
  'самопроверка: три признака найдены; исправные формы и проза отвергнуты'
)

// --- 5. Молчаливые пропуски в самих инструментах ------------------------
console.log('\n=== Молчаливые пропуски в коде инструментов ===')
const tools = [
  ...disk.filter(f => f.startsWith('scripts/') && f.endsWith('.cjs')),
  ...disk.filter(f => f.startsWith('src/__tests__/') && f.endsWith('.ts')),
]
const suspects = []
const scan = require('./lib/read-census.cjs').census('инструменты')
for (const t of tools) {
  let text
  try {
    text = fs.readFileSync(t, 'utf8')
  } catch (e) {
    // A swallowed read used to make this probe unfalsifiable: with every read
    // failing it still printed "540 checked, 0 blind", because the number
    // described the list git had enumerated rather than the files it opened.
    // The tool that looks for silent blindness was silently blind.
    scan.unread.push(`${t}: ${e.message}`)
    continue
  }
  scan.read++
  const flags = flagsFor(text)
  if (flags.length) suspects.push({ t, flags })
}
scan.report(tools.length)
console.log(
  `  инструментов проверено: ${scan.read}, с признаками слепоты: ${suspects.length}`
)
for (const s of suspects)
  console.log(`    ${s.t}\n        ${s.flags.join('; ')}`)
