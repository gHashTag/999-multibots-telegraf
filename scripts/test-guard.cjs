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

/**
 * A HANDED-IN LIST CAN BE WRONG IN THE OPPOSITE DIRECTION.
 *
 * This first-push bug was fixed twice, independently, from two different
 * configs -- and BOTH reports were accurate:
 *
 *   with `glob:` and `{push_files}` in lefthook.yml, a branch with no remote
 *   counterpart made lefthook hand over the ENTIRE repository. `vitest related`
 *   got hundreds of paths, never started, and the gate stopped the push saying
 *   "tests failed" when not one test had run;
 *
 *   with both removed -- what lefthook.yml does now -- the computed list is
 *   EMPTY instead, and lefthook skips the command before this script starts.
 *
 * The config passes nothing today, so `filesBeingPushed()` above is the live
 * path. This narrowing stays for the other case: it costs one `git diff`, and
 * it is what stands between a re-added `{push_files}` and a gate that blocks
 * every push on a fresh branch.
 *
 * If git does not answer, the declared list is used unchanged. A gate has no
 * business quietly passing because of its own failure.
 */
function narrowToBranch(declared) {
  let changed
  try {
    changed = execFileSync(
      'git',
      ['diff', '--name-only', 'origin/main...HEAD'],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    )
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
  } catch {
    return declared // git did not answer -- go with what was given.
  }
  if (!changed.length) return declared

  const mine = new Set(changed)
  const both = declared.filter(f => mine.has(f))
  if (both.length !== declared.length) {
    console.log(
      `[tests] handed ${declared.length} files, this branch changes ` +
        `${both.length} -- checking those`
    )
  }
  return both
}

const isCode = f => /\.(ts|tsx|js|jsx)$/.test(f)
const passed = process.argv.slice(2).filter(isCode)
const files = passed.length
  ? narrowToBranch(passed)
  : filesBeingPushed().filter(isCode)
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
/*
 * exitCode, not exit(): process.exit throws away writes still queued on a pipe,
 * and this script prints a list that a person reads through one. Node's own
 * documentation calls the result "truncated and lost". Measured on the Cyrillic
 * gate, 2026-09-17: 966, 7706 and 8484 of the same 8484 lines on three runs.
 * Safe here because this is the last statement at the top level.
 */
process.exitCode = 1
