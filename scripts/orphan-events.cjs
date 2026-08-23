#!/usr/bin/env node
/**
 * Сверяет события, которые бот ОТПРАВЛЯЕТ, с событиями, на которые он ПОДПИСАН.
 *
 * Повод: событие 'render/execute' отправлялось из последнего шага пайплайна
 * AI Reels и не слушалось никем. Пайплайн тратил деньги у четырёх провайдеров
 * и возвращал success:true, не отрендерив ничего. Нашлось это случайно,
 * поэтому — скрипт, а не ещё одно чтение глазами.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', 'src')
const files = []
;(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) {
      if (!/node_modules|__tests__|\/test\//.test(p)) walk(p)
    } else if (/\.ts$/.test(p) && !/\.test\.ts$/.test(p)) files.push(p)
  }
})(ROOT)

const sent = new Map() // event -> [file:line]
const subscribed = new Map()

// Отправка: .send({ ... name: 'x' ... }) — name может быть на другой строке,
// поэтому ищем в окне после .send(, а не в одной строке.
const SEND = /\.send\(\s*\{/g
// Подписка: { event: 'x' } в определении функции
const SUB = /\{\s*event:\s*['"]([^'"]+)['"]/g
// Отправка через провайдер: sendEvent('INSTANCE', 'event-name', ...)
const SEND_EVENT = /sendEvent\(\s*['"][^'"]+['"]\s*,\s*['"]([^'"]+)['"]/g

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const rel = path.relative(path.resolve(__dirname, '..'), f)
  const lineOf = i => src.slice(0, i).split('\n').length

  let m
  while ((m = SEND.exec(src))) {
    const win = src.slice(m.index, m.index + 600)
    const nm = win.match(/name:\s*['"]([^'"]+)['"]/)
    if (nm) {
      if (!sent.has(nm[1])) sent.set(nm[1], [])
      sent.get(nm[1]).push(`${rel}:${lineOf(m.index)}`)
    }
  }
  while ((m = SEND_EVENT.exec(src))) {
    if (!sent.has(m[1])) sent.set(m[1], [])
    sent.get(m[1]).push(`${rel}:${lineOf(m.index)}`)
  }
  while ((m = SUB.exec(src))) {
    if (!subscribed.has(m[1])) subscribed.set(m[1], [])
    subscribed.get(m[1]).push(`${rel}:${lineOf(m.index)}`)
  }
}

const orphans = [...sent.keys()].filter(e => !subscribed.has(e)).sort()
const unused = [...subscribed.keys()].filter(e => !sent.has(e)).sort()

// Какие функции РЕАЛЬНО зарегистрированы. Подписка без отправителя у
// зарегистрированной функции = функция недостижима: она развёрнута, выглядит
// живой, и не может быть запущена ничем в этом коде.
//
// Эта половина важнее списка осиротевших событий, и именно её я однажды
// пролистал: скрипт напечатал 'neuro/photo.generate', а я всё равно правил тот
// файл, считая его рабочим. Поэтому теперь она печатается ПЕРВОЙ и с явным
// словом «НЕДОСТИЖИМА».
let registeredSrc = ''
try {
  registeredSrc = fs.readFileSync(
    path.resolve(__dirname, '..', 'src', 'inngest_app', 'registerFunctions.ts'),
    'utf8'
  )
} catch {}
const isRegistered = file => {
  const base = path.basename(file, '.ts')
  return (
    registeredSrc.includes(`/${base}'`) || registeredSrc.includes(`/${base}"`)
  )
}
const unreachable = unused.filter(e =>
  subscribed.get(e).some(loc => isRegistered(loc.split(':')[0]))
)

console.log(`отправляется событий:  ${sent.size}`)
console.log(`подписок:              ${subscribed.size}`)
console.log()
console.log(
  'ОГОВОРКА: скрипт видит только отправителей ВНУТРИ этого репозитория.'
)
console.log(
  'Функцию могут запускать извне — вебхук, панель Inngest, другой сервис.'
)
console.log('Список ниже — кандидаты на проверку, а не приговор.')
console.log()
console.log(
  `🚨 ЗАРЕГИСТРИРОВАНА, НО НЕДОСТИЖИМА ИЗ КОДА — триггер никто не шлёт (${unreachable.length}):`
)
for (const e of unreachable)
  console.log(`   ${e}\n      ← ${subscribed.get(e).join(', ')}`)
console.log()
console.log(`❌ ОТПРАВЛЯЕТСЯ, НО НИКТО НЕ СЛУШАЕТ (${orphans.length}):`)
for (const e of orphans)
  console.log(`   ${e}\n      ← ${sent.get(e).join(', ')}`)
console.log()
console.log(
  `⚠️  ПОДПИСКА ЕСТЬ, НО НИКТО НЕ ШЛЁТ, функция НЕ зарегистрирована (${unused.length - unreachable.length}):`
)
for (const e of unused.filter(x => !unreachable.includes(x)))
  console.log(`   ${e}  (${subscribed.get(e)[0]})`)

// BASELINE. На момент подключения скрипта к pre-push в репозитории уже было
// 16 недостижимых функций и осиротевшие события — долг, накопленный годами.
// Ворота «падать при любом совпадении» блокировали бы КАЖДЫЙ push, и их бы
// отключили в тот же день; ворота, которые никогда не падают, бесполезны.
//
// Поэтому падаем только на НОВОМ. Уже известное остаётся в выводе с числом,
// чтобы долг не исчез из виду: молча урезанный список читается как «всё
// чисто», хотя это не так.
//
// Обновить базу после починки:  node scripts/orphan-events.cjs --update-baseline
const BASELINE_PATH = path.resolve(__dirname, 'orphan-events-baseline.json')
const current = { orphans, unreachable }

if (process.argv.includes('--update-baseline')) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + '\n')
  console.log(
    `\n💾 База обновлена: ${orphans.length} осиротевших, ${unreachable.length} недостижимых.`
  )
  process.exitCode = 0
} else {
  let baseline = { orphans: [], unreachable: [] }
  try {
    baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
  } catch {
    // Базы нет — ведём себя как раньше, падая на любом совпадении.
    // Молча пропустить здесь значит превратить ворота в украшение.
  }
  const newOrphans = orphans.filter(e => !baseline.orphans.includes(e))
  const newUnreachable = unreachable.filter(
    e => !baseline.unreachable.includes(e)
  )
  const fixed =
    baseline.orphans.filter(e => !orphans.includes(e)).length +
    baseline.unreachable.filter(e => !unreachable.includes(e)).length

  console.log()
  console.log(
    `📋 База: ${baseline.orphans.length} осиротевших + ${baseline.unreachable.length} недостижимых — известный долг, он НЕ блокирует.`
  )
  if (fixed)
    console.log(
      `✅ Починено с прошлого раза: ${fixed}. Обновите базу: --update-baseline`
    )

  if (newOrphans.length || newUnreachable.length) {
    console.log()
    console.log(
      '🛑 НОВОЕ — этого не было раньше, добавлено вашими изменениями:'
    )
    for (const e of newOrphans)
      console.log(`   отправляется, никто не слушает: ${e}`)
    for (const e of newUnreachable)
      console.log(`   зарегистрирована, но недостижима: ${e}`)
    process.exitCode = 1
  } else {
    process.exitCode = 0
  }
}
