#!/usr/bin/env node
/**
 * READ-ONLY. Ищет функции, которые возвращают УСПЕХ в ветке ошибки.
 *
 * Родственник вчерашней находки: там функция молчала (возвращала void), здесь —
 * прямо утверждает, что всё получилось.
 *
 * Уже встречалось в этом проекте:
 *   generateInstagramScraping — отправка события закомментирована, а функция
 *   возвращала `success: true` с текстом «анализ запущен». Сцены списывали
 *   деньги и верили. 28 списаний, 94 звезды, ноль запусков (PR #510).
 *
 * Что ищем: внутри `catch (...) { … }` — возврат `true` или объекта с
 * `success: true`; а также возврат успеха сразу после записи об ошибке.
 *
 * САМОПРОВЕРКА обязательна: пустой результат без неё ничего не значит.
 *
 * Ничего не пишет.
 */
const fs = require('fs')
const path = require('path')

const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '')

const SUCCESS_RETURN = /return\s*(true\b|\{[^}]*success\s*:\s*true)/

/**
 * Находит блоки catch и смотрит, не возвращают ли они успех.
 */
function findCatchSuccess(text, file) {
  const lines = text.split('\n')
  const hits = []

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)\}?\s*catch\s*(\([^)]*\))?\s*\{/)
    if (!m) continue
    const indent = m[1].length

    let end = -1
    for (let j = i + 1; j < Math.min(i + 60, lines.length); j++) {
      const l = lines[j]
      if (!l.trim()) continue
      const ind = l.length - l.trimStart().length
      if (ind <= indent && /^\s*\}/.test(l)) {
        end = j
        break
      }
    }
    if (end < 0) continue

    const body = lines.slice(i + 1, end).join('\n')
    if (!SUCCESS_RETURN.test(body)) continue

    hits.push({
      file,
      line: i + 1,
      kind: 'catch → успех',
      snippet: body
        .trim()
        .split('\n')
        .find(l => SUCCESS_RETURN.test(l))
        ?.trim()
        .slice(0, 70),
    })
  }
  return hits
}

/**
 * Возврат успеха в пределах пяти строк после записи об ошибке — без
 * промежуточного `return`/`throw`.
 */
function findLogThenSuccess(text, file) {
  const lines = text.split('\n')
  const hits = []
  for (let i = 0; i < lines.length; i++) {
    if (!/(logger\.(error|warn)|console\.(error|warn))\s*\(/.test(lines[i]))
      continue
    const window = lines.slice(i, Math.min(i + 8, lines.length))
    const idx = window.findIndex((l, k) => k > 0 && SUCCESS_RETURN.test(l))
    if (idx < 0) continue
    // Если между ними есть выход — это другая ветка, не наш случай.
    const between = window.slice(1, idx).join('\n')
    if (/\b(return|throw)\b/.test(between)) continue
    hits.push({
      file,
      line: i + 1,
      kind: 'ошибка → успех',
      snippet: window[idx].trim().slice(0, 70),
    })
  }
  return hits
}

const SELF_CHECK = `
async function doWork() {
  try {
    await send()
  } catch (e) {
    logger.error('не удалось', e)
    return { success: true, message: 'запущено' }
  }
}
function other() {
  logger.error('отправка отключена')
  return true
}
`

function main() {
  const s1 = findCatchSuccess(SELF_CHECK, 'самопроверка')
  const s2 = findLogThenSuccess(SELF_CHECK, 'самопроверка')
  if (!s1.length || !s2.length) {
    console.error('❌ САМОПРОВЕРКА НЕ ПРОШЛА — искалке верить нельзя', {
      catchSuccess: s1.length,
      logThenSuccess: s2.length,
    })
    process.exit(2)
  }
  console.log(
    `самопроверка пройдена: ${s1.length + s2.length} образцов найдено\n`
  )

  const files = []
  ;(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (p.endsWith('.ts')) files.push(p)
    }
  })('src')

  const all = []
  for (const f of files) {
    if (f.includes('__tests__') || f.includes('/test/')) continue
    const text = strip(fs.readFileSync(f, 'utf8'))
    all.push(...findCatchSuccess(text, f), ...findLogThenSuccess(text, f))
  }

  const MONEY =
    /(payment|balance|charge|refund|price|stars|generat|render|train|webhook|callback|subscription)/i
  const hot = all.filter(h => MONEY.test(h.file))

  console.log(`всего мест «ошибка, но успех»: ${all.length}`)
  console.log(`из них в денежных и рабочих путях: ${hot.length}\n`)

  console.log('=== ЧИТАТЬ В ПЕРВУЮ ОЧЕРЕДЬ ===')
  for (const h of hot) {
    console.log(`  ${h.file}:${h.line}  [${h.kind}]`)
    console.log(`      ${h.snippet || ''}`)
  }
}

main()
