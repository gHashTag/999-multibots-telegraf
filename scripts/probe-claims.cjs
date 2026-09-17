#!/usr/bin/env node
/**
 * READ-ONLY. Сообщения, утверждающие факт, — и знает ли код этот факт.
 *
 * Три итерации подряд находилось одно и то же: бот сообщает не то, что
 * произошло.
 *   «Средства возвращены» — а возврат мог не пройти (PR #544)
 *   «У вас нет обученных моделей» — а обучение висит 13 месяцев (PR #550)
 *   «Стоимость: 40 ⭐» — а сорок взято из воздуха (PR #556)
 *
 * Это один класс: утверждение о факте, который код не проверял. Здесь я ищу
 * его целиком, а не по одному случаю.
 *
 * ЧТО ИЩЕМ. Сообщения человеку, содержащие утверждение:
 *   - о деньгах:   «возвращены», «списано», «начислено», «баланс»
 *   - об итоге:    «успешно», «готово», «отправлено», «завершено»
 *   - о сроке:     «займёт», «в течение», «через N минут»
 *
 * И смотрим, стоит ли РЯДОМ проверка того, о чём говорится.
 *
 * Знаменатель обязателен: сколько сообщений всего, сколько с утверждением,
 * сколько из них подкреплены проверкой.
 *
 * САМОПРОВЕРКА обязательна.
 *
 * Ничего не пишет.
 */
const fs = require('fs')
const path = require('path')

/** Убирает блочные комментарии, СОХРАНЯЯ количество строк. */
const strip = s =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m =>
      '\n'.repeat((m.match(/\n/g) || []).length)
    )
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

const CLAIMS = [
  ['деньги вернули', /(возвращен|возврат сделан|refunded|refund complete)/i],
  ['деньги списали', /(списано|списан[оы]|charged|deducted)/i],
  ['деньги начислили', /(начислен|зачислен|credited|added to your balance)/i],
  [
    'итог достигнут',
    /(успешно|готово!|завершен|отправлен|complete[d]?!|success)/i,
  ],
  ['срок назван', /(займ[её]т|в течение|через \d+|takes? \d+|within \d+)/i],
]

/** Признак, что рядом действительно проверяли то, о чём говорят. */
const VERIFIED =
  /(if\s*\(|\?\s|await\s+getUserBalance|result\.success|\.success\b|refunded|=== true|!== false|check)/

function main() {
  const SELF = `
    await ctx.reply('Средства возвращены.')
    const ok = await refund()
    if (ok) { await ctx.reply('Средства возвращены.') }
  `
  const hits = scanText(SELF, 'самопроверка')
  if (hits.length !== 2) {
    console.error(
      '❌ САМОПРОВЕРКА НЕ ПРОШЛА: ожидалось 2 утверждения, найдено',
      hits.length
    )
    process.exit(2)
  }
  console.log('самопроверка пройдена: оба утверждения найдены\n')

  const files = []
  ;(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (p.endsWith('.ts')) files.push(p)
    }
  })('src')

  let messages = 0
  const all = []
  for (const f of files) {
    if (f.includes('__tests__') || f.includes('/test/')) continue
    const text = strip(fs.readFileSync(f, 'utf8'))
    messages += (text.match(/ctx\.reply|sendMessage|editMessageText/g) || [])
      .length
    all.push(...scanText(text, f))
  }

  console.log('=== Знаменатель ===')
  console.log(`  всего обращений к человеку в коде: ${messages}`)
  console.log(`  из них с утверждением о факте:     ${all.length}`)

  const byKind = {}
  for (const h of all) byKind[h.kind] = (byKind[h.kind] || 0) + 1
  console.log('\n=== По видам утверждений ===')
  for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
    const unver = all.filter(h => h.kind === k && !h.verified).length
    console.log(
      `  ${k.padEnd(20)} ${String(v).padStart(4)}  из них без проверки рядом: ${unver}`
    )
  }

  const money = all.filter(h => /деньги/.test(h.kind) && !h.verified)
  console.log(
    `\n=== Денежные утверждения без проверки рядом: ${money.length} ===`
  )
  const byFile = {}
  for (const h of money) byFile[h.file] = (byFile[h.file] || 0) + 1
  for (const [f, n] of Object.entries(byFile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)) {
    console.log(`  ${String(n).padStart(3)}  ${f}`)
  }
  console.log('\n=== Первые пятнадцать ===')
  for (const h of money.slice(0, 15)) {
    console.log(`  ${h.file}:${h.line}`)
    console.log(`      ${h.text}`)
  }
}

/**
 * Утверждения ВНУТРИ обращений к человеку.
 *
 * Первая версия смотрела на любую строку с кавычками — и половину находок
 * составили строки logger.error. Запись в журнал человек не читает; утверждать
 * что-либо она не может. Считаем только текст, который уходит в сообщение.
 */
function scanText(text, file) {
  const lines = text.split('\n')
  const out = []
  const SPEAK =
    /(ctx\.reply|ctx\.replyWith|\.telegram\.sendMessage|editMessageText|sendMessageToUser)\s*\(/
  for (let i = 0; i < lines.length; i++) {
    if (!SPEAK.test(lines[i])) continue
    // тело вызова: до закрывающей скобки, но не длиннее двенадцати строк
    let depth = 0
    let started = false
    const body = []
    for (let j = i; j < Math.min(i + 12, lines.length); j++) {
      body.push(lines[j])
      for (const ch of lines[j]) {
        if (ch === '(') {
          depth++
          started = true
        } else if (ch === ')') depth--
      }
      if (started && depth === 0) break
    }
    const msg = body.join('\n')
    const around = lines.slice(Math.max(0, i - 6), i).join('\n')
    for (const [kind, re] of CLAIMS) {
      if (!re.test(msg)) continue
      out.push({
        file,
        line: i + 1,
        kind,
        verified: VERIFIED.test(around),
        text: (msg.match(new RegExp('.*(' + re.source + ').*', 'i')) || [''])[0]
          .trim()
          .slice(0, 72),
      })
      break
    }
  }
  return out
}

main()
