#!/usr/bin/env node
/**
 * ХРАПОВИК ПО ОШИБКАМ ТИПОВ ПЛЕЕРА: число может только падать.
 *
 * ЗАЧЕМ. «46 ошибок, столько же, сколько на main» несколько циклов подряд
 * закрывало каждую проверку и ровно ничего не значило. Внутри лежали два
 * настоящих ReferenceError, три молча теряемых значения и десять мёртвых
 * файлов. Постоянное число выглядит как фон ровно до тех пор, пока его никто
 * не читает.
 *
 * Ноль здесь недостижим сегодня, поэтому гейт не «должно быть 0», а «не
 * больше, чем вчера». Порог опускается вместе с работой и никогда не растёт.
 *
 * ПОЧЕМУ ОТДЕЛЬНЫЙ СКРИПТ, А НЕ СТРОЧКА В lefthook. Ошибки в плеере
 * посчитать простым `tsc --noEmit` из корня нельзя: у плеера собственный
 * tsconfig и собственные node_modules. И считать их надо ОСТОРОЖНО — см.
 * ниже три ловушки, каждая уже стоила отдельного цикла.
 */

const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

/**
 * Порог. Опускайте вместе с исправлениями — скрипт сам напомнит.
 * Значение на 2026-08-26: 14, из них 4 в пакете vibee-atoms.
 */
const BASELINE = 14

const PLAYER = path.join(__dirname, '..', 'apps', 'vibee-editor', 'player')

/**
 * ЛОВУШКА 1. `npx tsc` в каталоге без своих node_modules СТАВИТ из сети
 * посторонний пакет `tsc@2.0.4`, печатает «This is not the tsc command you
 * are looking for» и завершается с нулём ошибок. Проверка выглядит пройденной.
 * Поэтому — только явный путь к бинарнику, и его существование проверяется.
 */
const TSC = path.join(PLAYER, 'node_modules', '.bin', 'tsc')

function fail(msg) {
  console.error(`\n❌ ${msg}\n`)
  process.exit(1)
}

if (!fs.existsSync(TSC)) {
  fail(
    `не найден ${path.relative(process.cwd(), TSC)}\n` +
      '   Зависимости плеера не установлены. Это НЕ «проверка пройдена»:\n' +
      '   гейт, который не может отработать, должен падать громко.'
  )
}

/**
 * ЛОВУШКА 2. `--pretty false` обязателен. Цветной вывод вставляет ANSI-
 * последовательности между словом «error» и кодом «TS2304», и поиск по
 * литералу «error TS» на нём НЕ СОВПАДАЕТ. Однажды это дало «0 ошибок» там,
 * где их было 1230.
 */
const res = spawnSync(
  TSC,
  ['--noEmit', '-p', 'tsconfig.app.json', '--pretty', 'false'],
  { cwd: PLAYER, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
)

if (res.error) fail(`не удалось запустить tsc: ${res.error.message}`)

const out = `${res.stdout || ''}${res.stderr || ''}`
const lines = out.split('\n').filter(l => / error TS\d+: /.test(l))
const count = lines.length

/**
 * ЛОВУШКА 3. Ноль совпадений неотличим от «проверка не отработала»: пустой
 * вывод даёт то же самое число. Поэтому смотрим ещё и на КОД ВОЗВРАТА: tsc
 * выходит с нулём только когда ошибок действительно нет.
 */
if (count === 0 && res.status !== 0) {
  fail(
    `tsc завершился с кодом ${res.status}, но ни одной строки вида ` +
      '«error TSxxxx» в выводе нет.\n' +
      '   Это не чистый прогон, а сломанный запуск. Первые строки вывода:\n' +
      out.split('\n').slice(0, 5).map(l => `   | ${l}`).join('\n')
  )
}

// Разбивка по файлам — чтобы было видно, ГДЕ долг, а не только сколько его.
const byFile = new Map()
for (const l of lines) {
  const file = l.split('(')[0]
  byFile.set(file, (byFile.get(file) || 0) + 1)
}

console.log(`Ошибок типов в плеере: ${count} (порог ${BASELINE})`)
for (const [file, n] of [...byFile.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${file}`)
}

if (count > BASELINE) {
  fail(
    `стало БОЛЬШЕ: ${count} против порога ${BASELINE}.\n` +
      '   Новые ошибки типов — это находки, а не фон: за прошлыми такими\n' +
      '   скрывались ReferenceError в синке профиля и молча стёртое поле\n' +
      '   в схеме субтитров. Разберите их, а не поднимайте порог.'
  )
}

if (count < BASELINE) {
  console.log(
    `\n✅ стало меньше: ${count} < ${BASELINE}.\n` +
      `   Опустите BASELINE до ${count} в scripts/check-player-types.cjs —\n` +
      '   иначе храповик разболтается и пропустит возврат долга.'
  )
  process.exit(0)
}

console.log('\n✅ не выросло')
