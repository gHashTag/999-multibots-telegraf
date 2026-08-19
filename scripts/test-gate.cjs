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
 * Код возврата 1 — есть подтверждённые регрессии.
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
  const recheck = passingSet(runVitest(files))
  const confirmed = suspects.filter(id => !recheck.has(id))
  const flaky = suspects.filter(id => recheck.has(id))

  if (flaky.length) {
    console.log(`\nнестабильных (со второго раза зелёные): ${flaky.length}`)
    for (const id of flaky.slice(0, 10)) console.log(`  ~ ${id}`)
    if (flaky.length > 10) console.log(`  ... ещё ${flaky.length - 10}`)
  }

  if (!confirmed.length) {
    console.log('\n✅ Подтверждённых регрессий нет — всё подозрительное оказалось нестабильным.')
    return
  }

  console.log(`\n❌ РЕГРЕССИИ: ${confirmed.length}`)
  for (const id of confirmed) console.log(`  - ${id}`)
  process.exit(1)
}

main()
