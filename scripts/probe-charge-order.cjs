#!/usr/bin/env node
/**
 * READ-ONLY. Ищет места, где деньги списываются РАНЬШЕ работы.
 *
 * Повод: в двух сценах парсинга Instagram списание стояло до вызова, а вызов
 * возвращал успех, ничего не сделав. 28 списаний у трёх человек на 94 звезды
 * при нуле запусков (PR #510). Оба раза дефект был не в сервисе, а в ПОРЯДКЕ.
 *
 * Что считаем подозрительным: в одной функции сначала идёт списание
 * (updateUserBalance c MONEY_OUTCOME или processBalanceOperation), а ПОСЛЕ него
 * — вызов, который может не удаться: сетевой запрос, отправка события,
 * генерация.
 *
 * Инструмент не доказывает дефект, а сужает круг чтения: решение принимается
 * глазами. Ложные срабатывания ожидаемы — например, когда после списания идёт
 * только отправка сообщения.
 *
 * Ничего не пишет.
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

const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

// Признаки списания.
const CHARGE = /updateUserBalance\s*\(|processBalanceOperation\s*\(|processServiceBalanceOperation\s*\(|processBalanceVideoOperation\s*\(/
const OUTCOME = /MONEY_OUTCOME|SERVICE_PAYMENT/

// Признаки работы, которая может не удаться.
const RISKY = [
  [/\baxios\.(post|get|put)\b/, 'сетевой запрос axios'],
  [/\bfetch\s*\(/, 'сетевой запрос fetch'],
  [/inngest\.send\s*\(/, 'отправка события'],
  [/sendRenderAvatarVideoEvent\s*\(/, 'отправка события рендера'],
  [/generateInstagramScraping\s*\(/, 'запуск парсинга'],
  [/\breplicate\./, 'вызов Replicate'],
  [/\bfal\.(subscribe|run|queue)/, 'вызов Fal'],
  [/generate[A-Z]\w*\s*\(/, 'вызов генерации'],
]

const WINDOW = 60 // строк после списания, в пределах которых ищем работу

const hits = []

for (const f of files) {
  if (f.includes('__tests__') || f.includes('/test/')) continue
  const lines = strip(fs.readFileSync(f, 'utf8')).split('\n')

  for (let i = 0; i < lines.length; i++) {
    if (!CHARGE.test(lines[i])) continue

    // Списание ли это? Тип может стоять на соседних строках.
    const near = lines.slice(i, Math.min(i + 8, lines.length)).join('\n')
    const isOutcome = OUTCOME.test(near) || /processBalance|processService/.test(lines[i])
    if (!isOutcome) continue

    // Что идёт ПОСЛЕ, в пределах окна и до конца функции (грубо — до строки,
    // начинающейся с закрывающей скобки на нулевом отступе).
    const after = []
    for (let j = i + 1; j < Math.min(i + WINDOW, lines.length); j++) {
      if (/^\}/.test(lines[j])) break
      after.push([j, lines[j]])
    }

    for (const [rx, what] of RISKY) {
      const found = after.find(([, l]) => rx.test(l))
      if (found) {
        // Списание до работы САМО ПО СЕБЕ не дефект — дефект, если при неудаче
        // деньги не возвращаются. Ищем признак возврата в пределах той же
        // области видимости, ниже рискованного вызова.
        const tail = lines
          .slice(found[0], Math.min(found[0] + 220, lines.length))
          .join('\n')
        const hasRefund =
          /MONEY_INCOME|PaymentType\.REFUND|refund/i.test(tail) &&
          /updateUserBalance|refundUser|processBalance/.test(tail)

        hits.push({
          file: f,
          chargeLine: i + 1,
          riskLine: found[0] + 1,
          what,
          hasRefund,
          snippet: found[1].trim().slice(0, 70),
        })
        break
      }
    }
  }
}

console.log(`просмотрено файлов: ${files.length}`)
console.log(`\n=== СПИСАНИЕ РАНЬШЕ РАБОТЫ: ${hits.length} мест ===`)
console.log('   (не доказательство — список для чтения глазами)\n')

const byFile = new Map()
for (const h of hits) {
  if (!byFile.has(h.file)) byFile.set(h.file, [])
  byFile.get(h.file).push(h)
}

const noRefund = hits.filter(h => !h.hasRefund)
console.log(`из них БЕЗ признака возврата при неудаче: ${noRefund.length}\n`)

for (const [file, list] of [...byFile.entries()].sort()) {
  console.log(`  ${file}`)
  for (const h of list) {
    const mark = h.hasRefund ? 'возврат есть' : 'ВОЗВРАТА НЕ ВИДНО'
    console.log(`      списание :${String(h.chargeLine).padStart(4)}  ->  ${h.what} :${h.riskLine}   [${mark}]`)
    console.log(`          ${h.snippet}`)
  }
}

console.log('\n=== ЧИТАТЬ В ПЕРВУЮ ОЧЕРЕДЬ ===')
for (const h of noRefund) {
  console.log(`  ${h.file}:${h.chargeLine}  (работа на :${h.riskLine} — ${h.what})`)
}
