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
  const args = [
    'vitest',
    'run',
    '--reporter=json',
    `--outputFile=${TMP}`,
    ...targets,
  ]
  try {
    execFileSync('npx', args, {
      cwd: REPO,
      stdio: 'pipe',
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch {
    // Ненулевой код — это нормально: часть тестов красная. Отчёт всё равно
    // записан, и именно он нас интересует.
  }
  if (!fs.existsSync(TMP))
    throw new Error('vitest не записал отчёт — прогон не состоялся')
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

/**
 * Every assertion the run actually PRODUCED, whatever its status.
 *
 * The gate's suspects are baseline names missing from the PASSING set, and
 * that set answers two different questions with one silence: a test that ran
 * and failed is missing, and a test that never ran at all is also missing. A
 * retry then turns both into "flaky", which is a diagnosis for the first and a
 * misnomer for the second -- and files failing to enumerate is a known,
 * recurring condition on this machine (see the degraded-run banner below).
 *
 * With this set the two are told apart: failed means present here, absent
 * means the file did not produce the name at all.
 */
function ranSet(report) {
  const set = new Set()
  for (const file of report.testResults || []) {
    const rel = path.relative(REPO, file.name)
    for (const a of file.assertionResults || []) {
      set.add(`${rel} :: ${a.fullName || a.title}`)
    }
  }
  return set
}

function fileOf(id) {
  return id.split(' :: ')[0]
}

/**
 * Split the suspects three ways, given what the first run produced and what
 * the retry passed.
 *
 *   confirmed   -- still not passing on the retry: a real regression
 *   flakyRan    -- ran and failed, then passed: genuine flakiness
 *   flakyAbsent -- never appeared in the first run, then passed: NOT a flaky
 *                  test. The name was absent from the report entirely, which
 *                  is how a tree that stops enumerating files looks.
 *
 * A pure function on purpose. Inside main() these three lines could only be
 * exercised by an actual degradation event, and that cannot be summoned on
 * demand -- all twenty-five worktrees on this machine were healthy when it was
 * last checked. Untestable-in-place code is how a branch ships unproven.
 */
function classifySuspects(suspects, ranFirst, recheckPassing) {
  const confirmed = suspects.filter(id => !recheckPassing.has(id))
  const flaky = suspects.filter(id => recheckPassing.has(id))
  return {
    confirmed,
    flakyRan: flaky.filter(id => ranFirst.has(id)),
    flakyAbsent: flaky.filter(id => !ranFirst.has(id)),
  }
}

/**
 * The names this file PRODUCES right now, without running the tests.
 *
 * Listed PER FILE on purpose: a whole-suite `vitest list` aborts entirely on
 * the first unresolvable import in anybody's file and then returns emptiness
 * instead of an answer. null here means "could not ask" and an empty set means
 * "the file does not collect"; those are different news and are kept apart.
 */
function collectedNames(file) {
  let out
  try {
    out = execFileSync('npx', ['vitest', 'list', file], {
      cwd: REPO,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 32 * 1024 * 1024,
    })
  } catch {
    return null
  }
  const base = path.basename(file)
  const marker = `${base} > `
  const names = new Set()
  for (const line of out.split('\n')) {
    const at = line.indexOf(marker)
    if (at === -1) continue
    names.add(
      line
        .slice(at + marker.length)
        .split(' > ')
        .join(' ')
        .trim()
    )
  }
  return names
}

/**
 * WHY A TEST STOPPED PASSING: did it break, or was it renamed?
 *
 * This script compares SETS of names and cannot tell those two apart on its
 * own. A name nobody produces any more looks exactly like a failing test -- and
 * the re-check cannot cure it, because the re-check clears a suspect only by
 * SEEING IT PASS. One renamed suite therefore keeps the gate red on a clean
 * tree until somebody refreshes the snapshot, and a gate that is red for no
 * reason stops being read.
 *
 * That happened: the snapshot fell four days behind a rewritten
 * voiceValidation.test.ts, and the same fourteen names were reported as
 * regressions for about twenty runs until they were compared by hand (#1692).
 *
 * A VANISHED NAME DOES NOT TURN THE GATE GREEN. Renaming a test and DELETING
 * one are indistinguishable from the name alone, so passing quietly would mean
 * deleted coverage disappears unnoticed. The breakdown below only NAMES the
 * cause and says what to do about it; the decision stays with a person.
 */
function explainConfirmed(confirmed) {
  const byFile = new Map()
  for (const id of confirmed) {
    const f = fileOf(id)
    if (!byFile.has(f)) byFile.set(f, [])
    byFile.get(f).push(id)
  }
  const behaviour = []
  const vanished = []
  const unknown = []
  for (const [file, ids] of byFile) {
    const now = collectedNames(file)
    if (now === null) {
      unknown.push([file, ids, 'не смог перечислить тесты файла'])
      continue
    }
    if (now.size === 0) {
      unknown.push([file, ids, 'файл не собирается — ни одного теста'])
      continue
    }
    for (const id of ids) {
      const name = id.split(' :: ')[1]
      if (now.has(name)) behaviour.push(id)
      else vanished.push([id, ids.length, now.size])
    }
  }
  return { behaviour, vanished, unknown }
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
    console.log(
      `Запомнено в ${path.relative(REPO, BASELINE)}: ${now.size} зелёных.`
    )
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
  const ranFirst = ranSet(report)
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
  console.log(
    `\nподозреваемых: ${suspects.length} в ${files.length} файлах — перепроверяю…`
  )
  const recheck = passingSet(runVitest(files))
  const { confirmed, flakyRan, flakyAbsent } = classifySuspects(
    suspects,
    ranFirst,
    recheck
  )

  // Told apart, not merged: "ran and failed, then passed" is flakiness;
  // "never ran, then passed" is this machine, and calling it flaky hides the
  // only symptom the degradation problem produces here.
  if (flakyRan.length) {
    console.log(
      `\nнестабильных (упали, со второго раза зелёные): ${flakyRan.length}`
    )
    for (const id of flakyRan.slice(0, 10)) console.log(`  ~ ${id}`)
    if (flakyRan.length > 10) console.log(`  ... ещё ${flakyRan.length - 10}`)
  }

  if (flakyAbsent.length) {
    // NOT named `files`: that name is already taken by the retry target list
    // in this scope, and a shadowed accumulator is a defect this repo has
    // produced before.
    const absentFiles = [...new Set(flakyAbsent.map(fileOf))]
    console.log(
      `\n⚠️  НЕ ЗАПУСКАЛИСЬ в первом прогоне, зелёные во втором: ${flakyAbsent.length} в ${absentFiles.length} файл(ах)`
    )
    console.log(
      '   Это НЕ нестабильный тест: имени не было в отчёте вовсе. Так выглядит'
    )
    console.log(
      '   дерево, в котором файлы перестают перечисляться. Проверьте `tri trust`.'
    )
    for (const f of absentFiles.slice(0, 10)) console.log(`  ? ${f}`)
    if (absentFiles.length > 10)
      console.log(`  ... ещё ${absentFiles.length - 10}`)
  }

  if (!confirmed.length) {
    console.log(
      '\n✅ Подтверждённых регрессий нет — всё подозрительное оказалось нестабильным.'
    )
    return
  }

  const { behaviour, vanished, unknown } = explainConfirmed(confirmed)

  // Say FIRST when the run itself is degraded.
  //
  // A file that cannot be enumerated is not a failing test -- it is a file the
  // instrument could not read, and its names land in `unknown` below rather
  // than in the regression list. That part was already right. What was missing
  // is that a run with many such files cannot be trusted to have measured
  // anything, and the verdict was printed as if it could.
  //
  // This happened for real: a worktree began failing to resolve a Node builtin
  // through vite-node, 17 files stopped enumerating, and the run reported a
  // regression. The same commit in a fresh worktree was clean. Reverting every
  // change did not clear it, which is what proved the code innocent -- an hour
  // that this banner would have saved.
  //
  // The threshold is deliberately low. One unreadable file is a broken test;
  // several at once is a broken environment.
  const DEGRADED_FILES = 3
  const degraded = unknown.length >= DEGRADED_FILES
  if (degraded) {
    console.log(
      `\n🧪 ПРОГОН НЕНАДЁЖЕН: ${unknown.length} файл(ов) не прочитаны`
    )
    console.log(
      '   Столько нечитаемых файлов сразу -- это сломанное ОКРУЖЕНИЕ,'
    )
    console.log(
      '   а не сломанный код. Вердикт ниже мерил не то, что вы думаете.'
    )
    console.log('   Прежде чем верить: воспроизведите на СВЕЖЕМ дереве')
    console.log('   (./tri worktree <ветка>) и сравните число зелёных.')
  }

  if (behaviour.length) {
    console.log(`\n❌ РЕГРЕССИИ: ${behaviour.length}`)
    console.log('   Тест существует и перестал проходить — это поведение.')
    for (const id of behaviour) console.log(`  - ${id}`)
  }

  if (vanished.length) {
    console.log(`\n⚠️  СНИМОК УСТАРЕЛ: ${vanished.length}`)
    console.log(
      '   Этих имён файл больше НЕ ПРОИЗВОДИТ: тест переименован или удалён.'
    )
    console.log(
      '   Пройти они не могут никогда, поэтому перепроверка их не снимет.'
    )
    const seen = new Set()
    for (const [id, want, have] of vanished) {
      const f = fileOf(id)
      if (!seen.has(f)) {
        seen.add(f)
        console.log(`   ${f}: в снимке ${want}, файл выдаёт ${have}`)
      }
      console.log(`  ~ ${id}`)
    }
    console.log(
      '\n   Число тестов меняет переименование, а не нестабильность. Что делать:'
    )
    console.log(
      '    1) сверить, что замена покрывает то же или лучше (сравнить имена);'
    )
    console.log('    2) node scripts/test-gate.cjs --save;')
    console.log(
      '    3) сверить diff снимка — удалиться должны ТОЛЬКО ожидаемые имена;'
    )
    console.log('    4) сказать об этом в отчёте. Молча обновлять нельзя.')
    console.log('   Гейт остаётся красным: удалённый тест выглядит так же, как')
    console.log('   переименованный, и тихо потерять покрытие хуже.')
  }

  if (unknown.length) {
    console.log(`\n❓ НЕ КЛАССИФИЦИРОВАНО: ${unknown.length} файл(ов)`)
    for (const [file, ids, why] of unknown) {
      console.log(`   ${file}: ${why} (${ids.length} имён)`)
    }
  }

  // A distinct code, still non-zero, so anything testing for success is
  // unaffected while a caller that wants to tell "your change broke a test"
  // from "this machine cannot run the suite" now can.
  process.exit(degraded ? 3 : 1)
}

// Exported so the classification can be exercised on synthetic reports. A
// test with its own copy of these would be a twin, and the whole point here is
// that two questions must not share one answer.
module.exports = { passingSet, ranSet, fileOf, classifySuspects }

if (require.main === module) main()
