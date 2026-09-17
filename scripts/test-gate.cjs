#!/usr/bin/env node
/**
 * Честная проверка «не сломал ли я то, что работало».
 *
 * ЗАЧЕМ. Раньше я сравнивал суммарные счётчики: «было 214 красных, стало 214».
 * Это оказалось погодой, а не измерением: тот же самый коммит при повторных
 * прогонах давал 214, 215 и 165 — часть тестов ходит в живую базу и по сети, и
 * их результат зависит от внешнего мира и даже от моих собственных записей в
 * базу (заведя 12 профилей, я сделал зелёными полсотни чужих тестов).
 *
 * ЧТО ВМЕСТО. Сравниваем не ЧИСЛА, а МНОЖЕСТВА. Регрессия — это конкретный
 * тест, который проходил и перестал. Тест, красный до и после, не считается: он
 * и так сломан, к моей правке отношения не имеет. Тест, ставший зелёным, —
 * улучшение, а не повод для тревоги.
 *
 * Это устойчиво к нестабильным тестам ровно в той мере, в какой они красные
 * стабильно. Для флапающих есть перепроверка: подозреваемые прогоняются ещё
 * раз, и только выжившие считаются регрессией.
 *
 * ИСПОЛЬЗОВАНИЕ
 *   node scripts/test-gate.cjs --save     запомнить текущее состояние
 *   node scripts/test-gate.cjs            сравнить с запомненным
 *
 * Exit code 1 -- there are confirmed regressions OR vanished tests. These are
 * different troubles and the report separates them: FAILING means the code
 * broke, VANISHED means the name no longer exists (a rename or a deletion).
 * Both go red, but they are fixed differently, and calling them by one word
 * trains you to ignore red.
 */
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// Построчный текст, а не JSON: файл лежит в репозитории и обновляется часто,
// поэтому важнее читаемый diff, чем структура. Одна строка — один зелёный тест.
const BASELINE = path.join(__dirname, '..', '.test-baseline.txt')
const TMP = '/tmp/test-gate-report.json'
const SAVE = process.argv.includes('--save')
const REPO = path.join(__dirname, '..')

function runVitest(targets = []) {
  const args = ['vitest', 'run', '--reporter=json', `--outputFile=${TMP}`, ...targets]
  try {
    execFileSync('npx', args, { cwd: REPO, stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 })
  } catch {
    // Ненулевой код — это нормально: часть тестов красная. Отчёт всё равно
    // записан, и именно он нас интересует.
  }
  if (!fs.existsSync(TMP)) throw new Error('vitest не записал отчёт — прогон не состоялся')
  return JSON.parse(fs.readFileSync(TMP, 'utf8'))
}

/** Множество имён ПРОЙДЕННЫХ тестов, вида "относительный/путь :: имя теста". */
function passingSet(report) {
  const set = new Set()
  for (const file of report.testResults || []) {
    const rel = path.relative(REPO, file.name)
    for (const a of file.assertionResults || []) {
      if (a.status === 'passed') set.add(`${rel} :: ${a.fullName || a.title}`)
    }
  }
  return set
}

/** Every name in the run with its status: "path :: name" -> passed|failed|skipped. */
function statusMap(report) {
  const map = new Map()
  for (const file of report.testResults || []) {
    const rel = path.relative(REPO, file.name)
    for (const a of file.assertionResults || []) {
      map.set(`${rel} :: ${a.fullName || a.title}`, a.status)
    }
  }
  return map
}

function fileOf(id) {
  return id.split(' :: ')[0]
}

function main() {
  console.log('Прогон…')
  const report = runVitest()
  const now = passingSet(report)
  console.log(`зелёных тестов: ${now.size} (всего ${report.numTotalTests})`)

  if (SAVE) {
    const header =
      '# Зелёные тесты на момент снимка. Обновлять: npm run test:gate:save\n' +
      '# Проверять: npm run test:gate — покажет тесты, которые проходили и перестали.\n'
    fs.writeFileSync(BASELINE, header + [...now].sort().join('\n') + '\n')
    console.log(`Запомнено в ${path.relative(REPO, BASELINE)}: ${now.size} зелёных.`)
    return
  }

  if (!fs.existsSync(BASELINE)) {
    console.error('Нет сохранённого состояния. Сначала: npm run test:gate:save')
    process.exit(2)
  }

  const before = new Set(
    fs
      .readFileSync(BASELINE, 'utf8')
      .split('\n')
      .filter(line => line && !line.startsWith('#'))
  )

  const suspects = [...before].filter(id => !now.has(id))
  const gained = [...now].filter(id => !before.has(id))

  console.log(`стало зелёных больше на: ${gained.length}`)
  if (!suspects.length) {
    console.log('\n✅ Ни один проходивший тест не перестал проходить.')
    return
  }

  // ПЕРЕПРОВЕРКА. Тест мог упасть из-за недоступности внешнего сервиса, а не
  // из-за правки. Гоняем только подозреваемые файлы ещё раз: то, что снова
  // зелёное, — шум, а не регрессия.
  const files = [...new Set(suspects.map(fileOf))]
  console.log(`\nподозреваемых: ${suspects.length} в ${files.length} файлах — перепроверяю…`)
  const recheckReport = runVitest(files)
  const recheck = passingSet(recheckReport)
  const status = statusMap(recheckReport)

  const flaky = suspects.filter(id => recheck.has(id))
  /**
   * FAILING and VANISHED are different events; calling them one word was a bug.
   *
   * A name that is not in the recheck AT ALL did not "stop passing" -- it no
   * longer exists. Usually that means a rename, and that is exactly what
   * happened here: voiceValidation.test.ts was rewritten in #1496, fourteen old
   * names became thirteen new ones, and the file is green in full. Since then
   * the gate had been shouting "REGRESSIONS: 14" about work that broke nothing.
   *
   * The cost of that confusion is not inconvenience. Red that people learn to
   * skip devalues the red that is real: "no regressions" stops meaning
   * anything. So the gate still goes red (a deleted test is lost coverage, not
   * a trifle) but tells the truth about WHAT happened and names the next step.
   */
  const failed = suspects.filter(id => status.get(id) === 'failed')
  const vanished = suspects.filter(id => !status.has(id))

  if (flaky.length) {
    console.log(`\nнестабильных (со второго раза зелёные): ${flaky.length}`)
    for (const id of flaky.slice(0, 10)) console.log(`  ~ ${id}`)
    if (flaky.length > 10) console.log(`  ... ещё ${flaky.length - 10}`)
  }

  if (!failed.length && !vanished.length) {
    console.log('\n✅ Подтверждённых регрессий нет — всё подозрительное оказалось нестабильным.')
    return
  }

  if (failed.length) {
    console.log(`\n❌ REGRESSIONS (test exists and fails): ${failed.length}`)
    for (const id of failed) console.log(`  - ${id}`)
  }

  if (vanished.length) {
    const byFile = {}
    for (const id of vanished) byFile[fileOf(id)] = (byFile[fileOf(id)] || 0) + 1
    console.log(`\n⚠️  VANISHED (name absent from the run -- renamed or deleted): ${vanished.length}`)
    for (const [f, n] of Object.entries(byFile)) {
      // How many names took their place: a file where the old ones are gone and
      // just as many new ones stand is almost certainly a rename, not a loss.
      const nowInFile = [...status.keys()].filter(id => fileOf(id) === f).length
      console.log(`  ${f}: ${n} gone, ${nowInFile} in the file now`)
    }
    for (const id of vanished.slice(0, 10)) console.log(`  - ${id}`)
    if (vanished.length > 10) console.log(`  ... and ${vanished.length - 10} more`)
    console.log(
      '\n  If the rename was intentional, refresh the snapshot: npm run test:gate:save\n' +
        '  If a test was deleted without a replacement, that is lost coverage -- bring it back.'
    )
  }

  process.exit(1)
}

main()
