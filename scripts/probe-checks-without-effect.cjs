#!/usr/bin/env node
/**
 * READ-ONLY. Ищет проверки, у которых нет следствия: ошибку записали в журнал
 * и пошли дальше как ни в чём не бывало.
 *
 * Повод: в вебхуке обучения стояло
 *
 *   if (!trainingRecord) {
 *     logger.warn('не найдено (will be handled in Inngest)')
 *     // Все равно отправляем событие
 *   }
 *
 * Проверка была, следствия не было. Живая проверка прода подтверждала: запрос с
 * выдуманным идентификатором получал ответ «принято и передано дальше»
 * (исправлено в PR #529).
 *
 * Признак: блок `if (...)`, внутри которого есть запись в журнал об ошибке и
 * НЕТ ни `return`, ни `throw`, ни `res.status(...)`, ни `continue`, ни `break`.
 *
 * Инструмент не доказывает дефект: иногда «записать и продолжить» — осознанный
 * выбор. Он сужает круг чтения.
 *
 * САМОПРОВЕРКА обязательна: без неё пустой результат ничего не значит.
 * Прошлые искалки дважды давали ноль по ошибке в шаблоне.
 *
 * Ничего не пишет.
 */
const fs = require('fs')
const path = require('path')

const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '')

/** Записи в журнал, говорящие об ОШИБКЕ, а не о ходе работы. */
const ERROR_LOG = /(logger\.(error|warn)|console\.(error|warn))\s*\(/
/** Следствия, которые считаются настоящими. */
const EFFECT =
  /\b(return|throw|res\s*\.\s*status|continue|break|process\.exit|reject\()/

/**
 * Разбирает файл и возвращает блоки `if (...) { ... }`, где есть запись об
 * ошибке и нет следствия.
 */
function findBlocks(text, file) {
  const lines = text.split('\n')
  const hits = []

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)(?:\}\s*else\s+)?if\s*\(/)
    if (!m) continue
    const indent = m[1].length

    // Ищем закрывающую скобку блока по отступу.
    let end = -1
    for (let j = i + 1; j < Math.min(i + 40, lines.length); j++) {
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
    if (!ERROR_LOG.test(body)) continue
    if (EFFECT.test(body)) continue
    // Пустое тело или один комментарий — не интересно.
    if (!body.trim()) continue

    hits.push({
      file,
      line: i + 1,
      cond: lines[i].trim().slice(0, 80),
      size: end - i - 1,
    })
  }
  return hits
}

/** Заведомо-положительный образец: тот самый случай из вебхука обучения. */
const SELF_CHECK = `
    if (!trainingRecord) {
      logger.warn('[REPLICATE WEBHOOK] Training record not found', {
        training_id: payload.id,
      })
      // Все равно отправляем событие
    } else {
      logger.info('ok')
    }
`

function main() {
  const found = findBlocks(SELF_CHECK, 'самопроверка')
  if (!found.length) {
    console.error('❌ САМОПРОВЕРКА НЕ ПРОШЛА — искалке верить нельзя')
    process.exit(2)
  }
  console.log('самопроверка пройдена: образец найден\n')

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
    all.push(...findBlocks(strip(fs.readFileSync(f, 'utf8')), f))
  }

  // Приоритет — там, где цена ошибки выше.
  const MONEY =
    /(payment|balance|charge|refund|price|stars|webhook|callback|auth|token|secret)/i
  const hot = all.filter(h => MONEY.test(h.file) || MONEY.test(h.cond))
  const rest = all.filter(h => !hot.includes(h))

  console.log(`всего блоков «записал и пошёл дальше»: ${all.length}`)
  console.log(`из них в денежных и защитных местах: ${hot.length}\n`)

  console.log('=== ЧИТАТЬ В ПЕРВУЮ ОЧЕРЕДЬ ===')
  for (const h of hot.slice(0, 40)) {
    console.log(`  ${h.file}:${h.line}  (${h.size} строк)`)
    console.log(`      ${h.cond}`)
  }
  if (hot.length > 40) console.log(`  ... ещё ${hot.length - 40}`)

  console.log(`\n=== остальные: ${rest.length} (не печатаю) ===`)
}

main()
