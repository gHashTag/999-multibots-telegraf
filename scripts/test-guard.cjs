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
const BASELINE = resolve(root, 'scripts', 'tests-baseline.json')
const OUT = resolve(root, 'node_modules', '.cache', 'test-guard.json')

const declared = process.argv.slice(2).filter(f => /\.(ts|tsx|js|jsx)$/.test(f))

/**
 * Intersect what was handed in with what actually differs from origin/main.
 *
 * WHY. On the FIRST push of a new branch the remote ref does not exist, so
 * lefthook fills `{push_files}` with the ENTIRE repository. `vitest related`
 * then gets hundreds of paths and does not start at all -- and the gate stops
 * the push saying "tests failed", when not one test ran. Hit twice in one
 * shift on an untouched repository.
 *
 * On an ordinary push this is a no-op: the files already come from the diff.
 * On a new branch it collapses the repository to the real change.
 *
 * If git does not answer, the declared list is used unchanged. A gate has no
 * business quietly passing because of its own failure.
 */
let files = declared
try {
  const changed = execFileSync(
    'git',
    ['diff', '--name-only', 'origin/main...HEAD'],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
  )
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
  if (changed.length) {
    const mine = new Set(changed)
    const both = declared.filter(f => mine.has(f))
    if (both.length !== declared.length) {
      console.log(
        `[tests] handed ${declared.length} files, this branch changes ` +
          `${both.length} -- checking those`
      )
    }
    files = both
  }
} catch {
  // git did not answer -- go with what was given.
}

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

/**
 * Run vitest under a node that can load its config.
 *
 * `vitest related` loads the config through a CJS shim that `require()`s vite.
 * Vite 7 is ESM-only, so on node below 20.19 -- where `require(esm)` is not
 * allowed -- vitest dies at startup with ERR_REQUIRE_ESM and writes no report.
 * The gate then blocks the push saying "tests failed", when none ran.
 *
 * This bit the repository the moment vite 7 arrived in the shared root
 * node_modules. A git hook does not inherit an interactive shell's PATH, so it
 * gets whatever node is default -- here, 18.
 *
 * `bin/tri` already solves this by prepending the nvm 20 bin directory; the
 * gate needs the same and did not have it. If that directory is absent we run
 * as we are: a missing toolchain must surface as vitest's own error, not as a
 * silent pass.
 */
function nodeEnv() {
  const nvm = resolve(
    process.env.HOME || '',
    '.nvm',
    'versions',
    'node',
    'v20.19.0',
    'bin'
  )
  if (!existsSync(nvm)) return process.env
  return { ...process.env, PATH: `${nvm}:${process.env.PATH || ''}` }
}

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
    { cwd: root, stdio: ['ignore', 'ignore', 'inherit'], env: nodeEnv() }
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
