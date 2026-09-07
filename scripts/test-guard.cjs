#!/usr/bin/env node
/**
 * Гейт pre-push по тестам: падать на НОВОМ, а не на чужом долге.
 *
 * ЗАЧЕМ. Прямой `vitest related --run` в качестве ворот блокировал любой push.
 * Измерено прогоном на main: 183 файла тестов, 69 из них падают, 207 упавших
 * тестов из 2699. `vitest related` тянет тесты по графу импортов, поэтому
 * достаточно тронуть файл, который транзитивно импортирует один из этих 69, —
 * и push останавливается из-за поломки, к которой правка отношения не имеет.
 * Такие ворота отключают в первый же день, и они снова превращаются в фикцию.
 *
 * КАК. Сравниваем со снимком: scripts/tests-baseline.json — список ТЕСТОВЫХ
 * ФАЙЛОВ, которые падали на main на момент снятия. Файл из базы падает —
 * молчим и показываем счётчиком. Падает файл, которого в базе нет, — это
 * сломала текущая правка, и push останавливается.
 *
 * Долг НЕ прячется: его размер печатается при каждом прогоне. Молча урезанный
 * список читается как «всё чисто», хотя это не так.
 *
 * Обновить базу после починки тестов:  npm run test:baseline
 */
const { execFileSync } = require('child_process')
const { readFileSync, existsSync, unlinkSync } = require('fs')
const { resolve } = require('path')

const root = resolve(__dirname, '..')

/*
 * Before anything else: a git hook does not inherit a shell setup, and on this
 * machine its PATH resolves an old Node that cannot load vite. The gate then
 * blocks with an ESM stack trace and no broken test in sight -- and the push
 * goes through with --no-verify. See scripts/lib/usable-node.cjs.
 */
require('./lib/usable-node.cjs').ensureUsableNode(__filename, root)
const BASELINE = resolve(root, 'scripts', 'tests-baseline.json')
const OUT = resolve(root, 'node_modules', '.cache', 'test-guard.json')

/**
 * WHAT THIS PUSH ACTUALLY CARRIES.
 *
 * lefthook's `{push_files}` is empty when the branch has no counterpart on the
 * remote, and lefthook then SKIPS the command entirely -- "(skip) no files for
 * inspection", before this script is ever started. Verified 2026-09-07 with a
 * dry-run push to a fresh ref.
 *
 * That is the worst possible moment to check nothing: the FIRST push of a
 * feature branch is the one carrying every commit on it. The gate looked
 * healthy in the summary and had inspected zero files.
 *
 * So the range is computed here instead of being handed in. Explicit arguments
 * still win -- the script is also run by hand with a file list -- and this only
 * fills the gap when nothing was passed.
 */
function filesBeingPushed() {
  const git = (...a) => {
    try {
      // stderr is discarded: "no upstream configured" is an ANSWER here, not a
      // fault, and git's fatal printed above our own report reads as a broken
      // gate.
      return execFileSync('git', a, {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    } catch {
      return null
    }
  }

  // The branch's own remote counterpart, when it has one: everything between
  // it and HEAD is exactly what the push adds.
  let base = null
  const upstream = git(
    'rev-parse',
    '--abbrev-ref',
    '--symbolic-full-name',
    '@{upstream}'
  )
  if (upstream && git('rev-parse', '--verify', '--quiet', upstream)) {
    base = upstream
  }

  /*
   * No counterpart -- a new branch. Compare against where it left the default
   * branch. `merge-base` rather than `origin/main` itself: the range must
   * describe what THIS branch adds, not everything that landed on main while it
   * was being written.
   */
  if (!base) base = git('merge-base', 'origin/main', 'HEAD')
  if (!base) return []

  const out = git('diff', '--name-only', `${base}..HEAD`)
  return out ? out.split('\n').filter(Boolean) : []
}

const passed = process.argv.slice(2)
const files = (passed.length ? passed : filesBeingPushed()).filter(f =>
  /\.(ts|tsx|js|jsx)$/.test(f)
)
if (files.length === 0) {
  console.log('[тесты] в push нет файлов с кодом — проверять нечего')
  process.exit(0)
}

if (!existsSync(BASELINE)) {
  // Базы нет — ведём себя строго. Молча пропустить здесь значит превратить
  // ворота в украшение: ровно то, от чего этот файл и защищает.
  console.error(`[тесты] нет ${BASELINE}. Снимите базу: npm run test:baseline`)
  process.exit(1)
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
const known = new Set(baseline.файлы || [])

if (existsSync(OUT)) unlinkSync(OUT)

try {
  execFileSync(
    'npx',
    [
      'vitest',
      'related',
      '--run',
      '--reporter=json',
      `--outputFile=${OUT}`,
      ...files,
    ],
    { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] }
  )
} catch {
  // Ненулевой код здесь — это «есть упавшие тесты», нормальный ход событий.
  // Разбираем отчёт ниже. Если отчёта нет — значит vitest не запустился
  // вовсе, и это уже настоящая поломка.
}

if (!existsSync(OUT)) {
  console.error('[тесты] vitest не оставил отчёта — прогон не состоялся.')
  console.error(
    '        Это НЕ значит, что тесты целы: значит, их не запускали.'
  )
  process.exit(2)
}

const report = JSON.parse(readFileSync(OUT, 'utf8'))
const results = report.testResults || []
const failedFiles = results
  .filter(r => r.status === 'failed')
  .map(r => r.name.replace(root + '/', ''))

const fresh = failedFiles.filter(f => !known.has(f))
const inherited = failedFiles.filter(f => known.has(f))

console.log(
  `[тесты] затронуто файлов ${results.length}, падает ${failedFiles.length} ` +
    `(из них известный долг ${inherited.length})`
)
console.log(
  `[тесты] база: ${baseline.падающих_файлов} падающих файлов из ` +
    `${baseline.всего_файлов}, снята ${baseline.снято} — НЕ блокирует`
)

if (fresh.length === 0) {
  process.exit(0)
}

console.error('')
console.error(
  '🛑 Упали тесты, которых НЕ было в базе — это сломала ваша правка:'
)
for (const f of fresh) console.error(`   ${f}`)
console.error('')
console.error(
  '   Посмотреть подробности:  npx vitest related --run ' +
    files.slice(0, 3).join(' ')
)
process.exit(1)
