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

// Some senders name the event through a constant, e.g.
//   inngest.send({ name: INNGEST_EVENTS.WELCOME_AVATAR_GENERATE, ... })
// The literal-only match above misses those, so the event looked like it had a
// registered subscriber but no sender ("unreachable") when in fact it is sent.
// Resolve INNGEST_EVENTS.X to its string from client.ts so a constant-named send
// counts the same as a literal one.
const EVENT_CONSTS = (() => {
  const map = {}
  try {
    const clientSrc = fs.readFileSync(
      path.resolve(__dirname, '..', 'src', 'inngest_app', 'client.ts'),
      'utf8'
    )
    const block = clientSrc.match(/INNGEST_EVENTS\s*=\s*\{([\s\S]*?)\n\}/)
    if (block) {
      for (const m of block[1].matchAll(/(\w+):\s*['"]([^'"]+)['"]/g)) {
        map[m[1]] = m[2]
      }
    }
  } catch {}
  return map
})()

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const rel = path.relative(path.resolve(__dirname, '..'), f)
  const lineOf = i => src.slice(0, i).split('\n').length

  let m
  while ((m = SEND.exec(src))) {
    const win = src.slice(m.index, m.index + 600)
    const nm = win.match(/name:\s*['"]([^'"]+)['"]/)
    const nmConst = nm ? null : win.match(/name:\s*INNGEST_EVENTS\.(\w+)/)
    const eventName = nm ? nm[1] : nmConst ? EVENT_CONSTS[nmConst[1]] : null
    if (eventName) {
      if (!sent.has(eventName)) sent.set(eventName, [])
      sent.get(eventName).push(`${rel}:${lineOf(m.index)}`)
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
/*
 * A RENAME ALIAS IS NOT AN ORPHAN.
 *
 * A function can subscribe to two names at once: the canonical one and the
 * old one, kept for senders that have not moved yet. The code says so:
 *
 *   // Canonical event first, legacy event kept for existing senders.
 *   [{ event: 'broadcast/message.send' }, { event: 'broadcast/send-message' }]
 *
 * The legacy name has no sender -- that is the point of the move -- but the
 * function is not unreachable: the canonical name starts it perfectly well.
 *
 * On 17.09.2026 such a move was under way across a dozen functions and this
 * list grew from 17 to 39. Thirty-nine lines on every push is exactly how
 * people stop reading a gate, and a real orphan would drown among them.
 *
 * So: if the SAME FILE subscribes to another event that does have a sender,
 * this is an alias. It is printed separately and quietly.
 */
const filesOf = e => new Set(subscribed.get(e).map(loc => loc.split(':')[0]))
const hasLiveSibling = e => {
  const mine = filesOf(e)
  return [...subscribed.keys()].some(
    other =>
      other !== e &&
      sent.has(other) &&
      [...filesOf(other)].some(f => mine.has(f))
  )
}
const registeredUnused = unused.filter(e =>
  subscribed.get(e).some(loc => isRegistered(loc.split(':')[0]))
)
const aliases = registeredUnused.filter(hasLiveSibling)
const unreachable = registeredUnused.filter(e => !hasLiveSibling(e))

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
/*
 * COUNT FUNCTIONS, NOT NAMES.
 *
 * The fact this section exists for is "nothing in this code can start this
 * function". A function is one thing however many names it answers to, and
 * printing it twice doubles the list without adding a finding.
 *
 * That is exactly how 17 unreachable became 39 in a day: the rename came
 * through a dozen functions at once, and each arrived as a pair.
 */
const byFile = new Map()
for (const e of unreachable) {
  for (const loc of subscribed.get(e)) {
    const f = loc.split(':')[0]
    if (!byFile.has(f)) byFile.set(f, { events: new Set(), locs: new Set() })
    byFile.get(f).events.add(e)
    byFile.get(f).locs.add(loc)
  }
}
console.log(
  `🚨 ЗАРЕГИСТРИРОВАНА, НО НЕДОСТИЖИМА ИЗ КОДА — триггер никто не шлёт ` +
    `(функций: ${byFile.size}, имён: ${unreachable.length}):`
)
for (const [f, v] of [...byFile.entries()].sort())
  console.log(`   ${[...v.events].sort().join(' / ')}\n      ← ${f}`)
if (aliases.length) {
  console.log()
  console.log(
    `· старое имя при переименовании — функция достижима каноническим (${aliases.length}):`
  )
  console.log(`   ${aliases.join(', ')}`)
}
console.log()
console.log(`❌ ОТПРАВЛЯЕТСЯ, НО НИКТО НЕ СЛУШАЕТ (${orphans.length}):`)
for (const e of orphans)
  console.log(`   ${e}\n      ← ${sent.get(e).join(', ')}`)
/*
 * A RENAME ALIAS BELONGS IN NEITHER BUCKET.
 *
 * Taking the aliases out of `unreachable` without taking them out of here
 * simply moved them: nine events dropped into "subscribed but the function is
 * not registered", which the baseline then read as nine NEW problems and the
 * gate failed. Measured before pushing -- main exits 0, that version exited 1.
 *
 * They are a third category: a name kept on purpose for senders that have not
 * moved yet, on a function that is reachable through its canonical name.
 */
const notRegistered = unused.filter(
  x => !unreachable.includes(x) && !aliases.includes(x)
)

console.log()
console.log(
  // COUNTED FROM THE LIST, NOT ALONGSIDE IT.
  //
  // This said `unused.length - unreachable.length`, which happened to equal
  // the list underneath until a third bucket appeared -- then the heading
  // said 16 and the lines below it numbered 7. A count computed a second way
  // drifts from the thing it labels, and the label is what gets believed.
  `⚠️  ПОДПИСКА ЕСТЬ, НО НИКТО НЕ ШЛЁТ, функция НЕ зарегистрирована (${notRegistered.length}):`
)
for (const e of notRegistered) console.log(`   ${e}  (${subscribed.get(e)[0]})`)

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
// ДОБАВЛЕНО: третья категория тоже сравнивается с базой.
// Раньше «подписка есть, никто не шлёт, функция НЕ зарегистрирована» только
// печаталась: можно было добавить функцию, которая НИКОГДА не выполнится, и
// гейт оставался зелёным (проверено подсадкой selftest-функции). Печатать
// проблему и не падать на ней — то же самое, что её не искать.
const current = { orphans, unreachable, notRegistered }

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
  // База, записанная до этого изменения, поля notRegistered не имеет —
  // тогда считаем весь текущий список известным долгом, а не «новым».
  const baselineNotRegistered = baseline.notRegistered ?? notRegistered
  const newNotRegistered = notRegistered.filter(
    e => !baselineNotRegistered.includes(e)
  )
  const fixed =
    baseline.orphans.filter(e => !orphans.includes(e)).length +
    baseline.unreachable.filter(e => !unreachable.includes(e)).length

  console.log()
  console.log(
    `📋 База: ${baseline.orphans.length} осиротевших + ${baseline.unreachable.length} недостижимых + ${baselineNotRegistered.length} незарегистрированных — известный долг, он НЕ блокирует.`
  )
  if (fixed)
    console.log(
      `✅ Починено с прошлого раза: ${fixed}. Обновите базу: --update-baseline`
    )

  if (newOrphans.length || newUnreachable.length || newNotRegistered.length) {
    console.log()
    console.log(
      '🛑 НОВОЕ — этого не было раньше, добавлено вашими изменениями:'
    )
    for (const e of newOrphans)
      console.log(`   отправляется, никто не слушает: ${e}`)
    for (const e of newUnreachable)
      console.log(`   зарегистрирована, но недостижима: ${e}`)
    for (const e of newNotRegistered)
      console.log(`   подписка есть, но функция не зарегистрирована: ${e}`)
    process.exitCode = 1
  } else {
    process.exitCode = 0
  }
}
