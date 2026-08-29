// Проверка: правка ДЕЙСТВИТЕЛЬНО лежит в файле на origin/main.
//
// ЗАЧЕМ. 24.08.2026 мой PR #668 был влит, а через шесть минут влился PR #669
// второго агента — отведённый от main ДО моего мержа и тронувший тот же файл.
// Его версия победила: функция исчезла, вызов мёртвого хоста вернулся.
//
// При этом git не соврал и ничего не скрыл:
//   git merge-base --is-ancestor <мой коммит> origin/main  -> ДА
//   git log                                                -> оба коммита на месте
// История честна. Файла в ней нет.
//
// Обнаружилось СЛУЧАЙНО: я пошёл смотреть поведение на проде и увидел прежний
// ответ. Без этой проверки правка считалась бы выкаченной, и цикл продолжил бы
// строить поверх того, чего нет.
//
// Изоляция через worktree защищает рабочее дерево, но НЕ порядок мержей. Две
// ветки от одного состояния, тронувшие один файл, перезапишут друг друга молча.
//
//   node .claude/loop-opus/verify-landed.mjs
//
// Выход 0 — все ожидаемые следы на месте. 1 — что-то пропало. 2 — проверить
// не удалось (молчаливый успех здесь был бы хуже отказа).

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// REPO выводится из расположения скрипта, а НЕ хардкодится.
//
// Прежде здесь стояло '/Users/playom/999-multibots-telegraf' — опечатка в
// имени пользователя (playom вместо playra). Каталог не существует, поэтому
// execFileSync('git', …, { cwd: REPO }) падал с ENOENT на КАЖДОМ запуске, и
// проверка «не перезаписана ли моя правка чужим мержем» не отрабатывала ни
// разу с момента написания — тихо выходила с кодом 2. Инструмент, который
// должен ловить молчаливую потерю правок, сам молча не работал.
//
// Скрипт лежит в <REPO>/.claude/loop-opus/, поэтому REPO — на три уровня выше.
// Так путь верен на любой машине и не зависит от имени пользователя.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
// The manifest is swappable by env, because otherwise this check cannot be made
// to FIRE -- and it never has fired: it either stayed quiet or, for six weeks,
// died with ENOENT on the typo'd path fixed above. A check with no observed
// failure is a claim, not a measurement. With no env set it is the same
// landed.json as before, byte for byte. The one caller is
// anomalies-selftest.mjs, whose fixtures/landed-lost.json carries a needle that
// cannot be on origin/main.
const MANIFEST = process.env.ANOMALIES_LANDED_MANIFEST
  ? new URL(`file://${path.resolve(process.env.ANOMALIES_LANDED_MANIFEST)}`)
  : new URL('./landed.json', import.meta.url)

/**
 * Что проверяем — «след» правки: путь к файлу и строка, которая обязана в нём
 * быть. Строка, а не коммит: коммит остаётся в истории даже когда содержимое
 * перезаписано, и именно это ввело меня в заблуждение.
 *
 * Формат: [{ pr, file, needle, note }]
 */
const marks = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))

function fileOnMain(file) {
  try {
    return execFileSync('git', ['show', `origin/main:${file}`], {
      cwd: REPO,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch {
    return null
  }
}

try {
  execFileSync('git', ['fetch', 'origin', '-q'], { cwd: REPO })
} catch (e) {
  console.error('НЕ ИЗМЕРЕНО: git fetch не прошёл —', e.message)
  process.exit(2)
}

let checked = 0
const lost = []

for (const m of marks) {
  const content = fileOnMain(m.file)
  if (content === null) {
    lost.push(`${m.file} — ФАЙЛА НЕТ на origin/main (PR #${m.pr})`)
    continue
  }
  checked++
  /**
   * Сравнение БЕЗ РЕГИСТРА. Дважды за две итерации инструмент кричал
   * «правка пропала», а на самом деле игла была записана строчными, тогда
   * как в файле стоит заглавная (начало предложения). Ложная тревога здесь
   * дороже пропуска: она предлагает cherry-pick поверх целого main.
   */
  if (!content.toLowerCase().includes(m.needle.toLowerCase())) {
    lost.push(`${m.file} — нет «${m.needle}» (PR #${m.pr}: ${m.note})`)
  }
}

// Знаменатель обязателен: пустой список нарушений при нуле проверенных
// неотличим от «проверка не состоялась».
console.log(`проверено следов: ${checked} из ${marks.length}`)

if (checked === 0) {
  console.error(
    'НЕ ИЗМЕРЕНО: ни одного файла не прочитано — вывод недействителен'
  )
  process.exit(2)
}

if (lost.length) {
  console.error(`\n❌ ПРАВКА ПРОПАЛА С main (${lost.length}):\n`)
  lost.forEach(l => console.error('   ' + l))
  console.error(
    '\nСкорее всего перезаписано чужим мержем: чужая ветка была отведена'
  )
  console.error('ДО вашего мержа, тронула тот же файл и влилась ПОСЛЕ.')
  console.error(
    'Восстанавливать cherry-pick поверх текущего main, а НЕ откатом чужого.'
  )
  process.exit(1)
}

console.log('\n✅ все следы на месте — ничего не перезаписано')
