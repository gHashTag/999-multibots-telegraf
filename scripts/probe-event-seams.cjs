#!/usr/bin/env node
/**
 * READ-ONLY. Сверяет имена событий Inngest: кто шлёт и кто слушает.
 *
 * Тот же класс дефекта, что и адреса маршрутов (см. docs/audit/route-seams.md):
 * имя события — строка, она проходит типы, сборку и деплой. Событие уходит,
 * никто его не берёт, и никакой ошибки не возникает — Inngest просто нигде не
 * находит подписчика. Отличить «работает» от «молча теряется» можно только
 * положив рядом два списка.
 *
 * Ищем:
 *   - события, которые ШЛЮТ, но НИКТО не слушает (потеря)
 *   - подписчиков без единого отправителя (мёртвая функция)
 *   - события, зарегистрированные, но не попавшие в registerFunctions
 *
 * Ничего не пишет и никуда не ходит по сети.
 */
const fs = require('fs')
const path = require('path')

const files = []
;(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (p.endsWith('.ts')) files.push(p)
  }
})('src')

// Комментарии вырезаем: в них цитируются старые имена при объяснении правок.
const strip = s =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const senders = new Map() // имя события -> [файл:строка]
const listeners = new Map()
const isTest = f =>
  f.includes('__tests__') || f.includes('/test/') || f.endsWith('.test.ts')

function add(map, name, where) {
  if (!map.has(name)) map.set(name, [])
  map.get(name).push(where)
}

/**
 * The matcher, callable on a sample.
 *
 * It was inline in the file loop, so it could not be pointed at a known case --
 * and a finder that cannot be pointed at one reports "nothing found" the same
 * way whether the seams line up or the regex stopped matching. Extracted only
 * so the control below can run it; the patterns are unchanged.
 */
function scanText(text) {
  const src = strip(text)
  const out = { senders: [], listeners: [] }
  // Отправка: inngest.send({ name: 'x/y' }) — в том числе в массиве.
  for (const m of src.matchAll(
    /\bname:\s*['"]([a-z0-9_-]+\/[a-z0-9_.-]+)['"]/gi
  )) {
    // Отсекаем совпадения внутри createFunction({id...}) — там ключ id, не name.
    out.senders.push({ name: m[1], index: m.index })
  }
  // Подписка: { event: 'x/y' } вторым аргументом createFunction
  for (const m of src.matchAll(
    /\bevent:\s*['"]([a-z0-9_-]+\/[a-z0-9_.-]+)['"]/gi
  )) {
    out.listeners.push({ name: m[1], index: m.index })
  }
  // Подписка на несколько: [{ event: 'a' }, { event: 'b' }] уже покрыта выше.
  return { ...out, src }
}

/**
 * POSITIVE CONTROL: one send and one subscribe, the pair this probe exists to
 * line up.
 *
 * NEGATIVE CONTROL: the two shapes that must NOT count. `id:` is the
 * createFunction identifier, which the comment above says to exclude and which
 * looks exactly like an event name; and a value without a slash is not an event
 * name at all. Each is rejected by a DIFFERENT part of the pattern -- the key
 * and the slash -- so neither can mask the other going wrong.
 */
const POSITIVE = [
  "await inngest.send({ name: 'model/train.requested' })",
  "inngest.createFunction({ id: 'trainer' }, { event: 'model/train.requested' }, run)",
].join('\n')

const NEGATIVE = [
  "inngest.createFunction({ id: 'model/train.requested' }, handler)",
  "await inngest.send({ name: 'plainnamenoslash' })",
].join('\n')

const cPos = scanText(POSITIVE)
if (cPos.senders.length !== 1 || cPos.listeners.length !== 1) {
  console.error(
    'самопроверка не прошла: заведомая пара отправитель+подписчик не распознана' +
      ` (нашлось ${cPos.senders.length} и ${cPos.listeners.length}).\n` +
      'списки ниже означали бы сломанный матчер, а не сошедшиеся швы.'
  )
  process.exit(2)
}
const cNeg = scanText(NEGATIVE)
if (cNeg.senders.length !== 0 || cNeg.listeners.length !== 0) {
  console.error(
    'самопроверка не прошла: матчер посчитал событием то, что им не является' +
      ` (${cNeg.senders.length} отправителей, ${cNeg.listeners.length} подписчиков).`
  )
  process.exit(2)
}
console.log('самопроверка: пара распознана, посторонние ключи отвергнуты')

for (const f of files) {
  const {
    senders: sd,
    listeners: ls,
    src,
  } = scanText(fs.readFileSync(f, 'utf8'))
  const at = i => `${f}:${src.slice(0, i).split('\n').length}`
  for (const m of sd)
    add(senders, m.name, at(m.index) + (isTest(f) ? ' (тест)' : ''))
  for (const m of ls)
    add(listeners, m.name, at(m.index) + (isTest(f) ? ' (тест)' : ''))
}

const prodOnly = arr => arr.filter(w => !w.includes('(тест)'))

console.log(`файлов просмотрено: ${files.length}`)
console.log(`уникальных имён в отправке: ${senders.size}`)
console.log(`уникальных имён в подписке: ${listeners.size}\n`)

// --- Отправляем, но никто не слушает -----------------------------------
const orphanSends = [...senders.entries()]
  .filter(([name]) => !listeners.has(name))
  .filter(([, where]) => prodOnly(where).length > 0)

console.log(`=== ШЛЁМ, НО НИКТО НЕ СЛУШАЕТ: ${orphanSends.length} ===`)
console.log('  (событие уходит, подписчика нет — потеря без единой ошибки)\n')
for (const [name, where] of orphanSends.sort(
  (a, b) => prodOnly(b[1]).length - prodOnly(a[1]).length
)) {
  const w = prodOnly(where)
  console.log(`  ${name}`)
  for (const x of w.slice(0, 4)) console.log(`      ${x}`)
  if (w.length > 4) console.log(`      ... ещё ${w.length - 4}`)
}

// --- Слушаем, но никто не шлёт -----------------------------------------
const orphanListens = [...listeners.entries()]
  .filter(([name]) => !senders.has(name))
  .filter(([, where]) => prodOnly(where).length > 0)

console.log(`\n=== СЛУШАЕМ, НО НИКТО НЕ ШЛЁТ: ${orphanListens.length} ===`)
console.log('  (функция зарегистрирована и никогда не сработает)\n')
for (const [name, where] of orphanListens) {
  console.log(`  ${name}`)
  for (const x of prodOnly(where).slice(0, 3)) console.log(`      ${x}`)
}

// --- Похожие имена: опечатки видно только рядом ------------------------
const norm = s => s.toLowerCase().replace(/[._-]/g, '')
const all = [...new Set([...senders.keys(), ...listeners.keys()])]
const near = []
for (let i = 0; i < all.length; i++) {
  for (let j = i + 1; j < all.length; j++) {
    if (all[i] === all[j]) continue
    if (norm(all[i]) === norm(all[j])) near.push([all[i], all[j]])
  }
}
console.log(
  `\n=== имена, различающиеся только разделителем/регистром: ${near.length} ===`
)
for (const [a, b] of near) console.log(`  ${a}   <->   ${b}`)

// --- Что зарегистрировано ----------------------------------------------
const regFile = 'src/inngest_app/registerFunctions.ts'
if (fs.existsSync(regFile)) {
  const reg = strip(fs.readFileSync(regFile, 'utf8'))
  const registered = [...reg.matchAll(/\b([a-zA-Z0-9_]+)\b/g)].map(m => m[1])
  const regSet = new Set(registered)
  console.log(`\n=== регистрация функций ===`)
  console.log(`  файл: ${regFile}, упомянуто идентификаторов: ${regSet.size}`)
}
