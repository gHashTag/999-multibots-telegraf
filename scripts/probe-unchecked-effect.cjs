#!/usr/bin/env node
/**
 * READ-ONLY. Ищет класс «действие, не проверившее, что предыдущий шаг
 * состоялся».
 *
 * Откуда взялся класс. Возврат денег вызывался, не спрашивая, было ли
 * списание: 126 возвратов из 171 (74%) без единого списания перед ними,
 * 974 звезды из воздуха (docs/audit/first-touch.md). Это не единичная ошибка,
 * а форма: шаг Б делает работу, полагая, что шаг А удался, и никогда этого
 * не проверяет.
 *
 * Родственники, уже найденные в этом проекте:
 *   - generateInstagramScraping возвращала success:true, ничего не запустив
 *   - setPayments молчала при неудачной вставке, а вызывающий вёл человека
 *     платить по несуществующему счёту
 *   - вебхук обучения слал видео, не найдя обучения в базе
 *
 * ЧТО ИЩЕМ: вызов функции, которая возвращает признак удачи, чей результат
 * НИКУДА не присваивается и не проверяется, — а следом в том же блоке идёт
 * действие с последствиями (деньги, отправка человеку, запись в базу).
 *
 * САМОПРОВЕРКА обязательна: пустой результат без неё ничего не значит.
 *
 * Ничего не пишет.
 */
const fs = require('fs')
const path = require('path')

/**
 * Убирает блочные комментарии, СОХРАНЯЯ количество строк.
 *
 * Первая версия просто вырезала их — и все номера строк ниже уезжали вверх на
 * длину комментария. Отчёт указывал не на тот код; заметил, когда пошёл читать
 * «находку» и увидел на этой строке совсем другое.
 */
const strip = s =>
  s.replace(/\/\*[\s\S]*?\*\//g, m =>
    '\n'.repeat((m.match(/\n/g) || []).length)
  )

/**
 * Функции, чей возврат означает «получилось / не получилось».
 * Список ручной: автоматически такое не отличить от обычных действий.
 */
const CHECKABLE = [
  'processBalanceOperation',
  'processBalanceVideoOperation',
  'processServiceBalanceOperation',
  'directPaymentProcessor',
  'updateUserBalance',
  'setPayments',
  'refundUser',
  'validateAndCalculateVideoModelPrice',
  'getUserByTelegramId',
  'getUserBalance',
]

/** Действия с последствиями, которые нельзя делать вслепую. */
const EFFECTS =
  /(sendVideo|sendPhoto|sendAudio|sendDocument|sendMessage|replyWithVideo|replyWithPhoto|\.reply\(|inngest\.send|\.insert\(|\.update\(|updateUserBalance|directPaymentProcessor|refundUser|savePrompt|saveVideoUrlToSupabase)/

/** Вызов, результат которого никуда не идёт. */
function isDiscarded(line, fn) {
  const re = new RegExp(`(^|[^\\w.])(await\\s+)?${fn}\\s*\\(`)
  if (!re.test(line)) return false
  // объявление самой функции — не вызов
  if (new RegExp(`(function|const|export)\\s+.*\\b${fn}\\b`).test(line))
    return false
  // присваивание, возврат, условие, ожидание результата — значит проверяют
  if (/[=]\s*(await\s+)?$/.test(line.split(fn)[0])) return false
  if (
    /\b(const|let|var|return|if|while|\?\?|&&|\|\|)\b/.test(line.split(fn)[0])
  )
    return false
  return true
}

function main() {
  const SELF_CHECK = `
    async function bad(ctx) {
      await processBalanceOperation({ ctx, amount: 10 })
      await ctx.reply('Готово!')
    }
    async function good(ctx) {
      const r = await processBalanceOperation({ ctx, amount: 10 })
      if (!r.success) return
      await ctx.reply('Готово!')
    }
  `
  const selfHits = scan(SELF_CHECK, 'самопроверка')
  const badFound = selfHits.some(h => h.fn === 'processBalanceOperation')
  const goodMissed = selfHits.length === 1
  if (!badFound || !goodMissed) {
    console.error('❌ САМОПРОВЕРКА НЕ ПРОШЛА — искалке верить нельзя', {
      найдено: selfHits.length,
      ожидалось: 1,
      что: selfHits.map(h => h.fn),
    })
    process.exit(2)
  }
  console.log(
    'самопроверка пройдена: плохой образец найден, хороший не задет\n'
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
    all.push(...scan(strip(fs.readFileSync(f, 'utf8')), f))
  }

  console.log(
    `всего мест «результат отброшен, а следом действие»: ${all.length}\n`
  )

  const byFn = {}
  for (const h of all) byFn[h.fn] = (byFn[h.fn] || 0) + 1
  console.log('по функциям:')
  for (const [k, v] of Object.entries(byFn).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(4)}  ${k}`)
  }

  const MONEY =
    /(payment|balance|charge|refund|price|stars|generat|render|train|webhook|callback|subscription|wizard|scene)/i
  const hot = all.filter(h => MONEY.test(h.file))
  console.log(`\nиз них в денежных и рабочих путях: ${hot.length}`)
  console.log('\n=== ЧИТАТЬ В ПЕРВУЮ ОЧЕРЕДЬ ===')
  for (const h of hot.slice(0, 40)) {
    console.log(`  ${h.file}:${h.line}  [${h.fn}]`)
    console.log(`      ${h.call}`)
    console.log(`      → ${h.effect}`)
  }
}

/** Ищет отброшенные результаты, за которыми в пределах 12 строк есть эффект. */
function scan(text, file) {
  const lines = text.split('\n')
  const hits = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*(\/\/|\*)/.test(line)) continue
    for (const fn of CHECKABLE) {
      if (!isDiscarded(line, fn)) continue
      // ищем эффект ниже, не выходя за конец блока
      let effect = null
      for (let j = i + 1; j < Math.min(i + 13, lines.length); j++) {
        if (/^\s*\}\s*$/.test(lines[j])) break
        if (EFFECTS.test(lines[j])) {
          effect = lines[j].trim().slice(0, 68)
          break
        }
      }
      if (!effect) continue
      hits.push({
        file,
        line: i + 1,
        fn,
        call: line.trim().slice(0, 68),
        effect,
      })
      break
    }
  }
  return hits
}

main()
