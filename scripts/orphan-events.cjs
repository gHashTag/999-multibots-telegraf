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
    if (e.isDirectory()) { if (!/node_modules|__tests__|\/test\//.test(p)) walk(p) }
    else if (/\.ts$/.test(p) && !/\.test\.ts$/.test(p)) files.push(p)
  }
})(ROOT)

const sent = new Map()      // event -> [file:line]
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

console.log(`отправляется событий:  ${sent.size}`)
console.log(`подписок:              ${subscribed.size}`)
console.log()
console.log(`❌ ОТПРАВЛЯЕТСЯ, НО НИКТО НЕ СЛУШАЕТ (${orphans.length}):`)
for (const e of orphans) console.log(`   ${e}\n      ← ${sent.get(e).join(', ')}`)
console.log()
console.log(`⚠️  ПОДПИСКА ЕСТЬ, НО НИКТО НЕ ШЛЁТ (${unused.length}):`)
for (const e of unused) console.log(`   ${e}  (${subscribed.get(e)[0]})`)

process.exitCode = orphans.length ? 1 : 0
