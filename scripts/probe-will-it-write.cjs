#!/usr/bin/env node
/**
 * READ-ONLY. Проверка лечения: будут ли новые поля вообще заполняться.
 *
 * Три итерации подряд я чинил различимость — причина возврата, исход
 * генерации, признак записи видео. Все три правки построены на предположении,
 * что код исполняется. Предположение стоит проверить ДО того, как через месяц
 * обнаружится, что копилась пустота: в этом проекте 13 функций Inngest из 35
 * не зарегистрированы, и три моих прошлых правки уже уезжали в такие файлы
 * (docs/audit/unregistered-functions.md).
 *
 * ЧТО СЧИТАЕТ. Для каждого места, где пишется новое поле, — есть ли путь по
 * импортам от точек входа (src/index.ts, src/bot.ts), причём БЕЗ учёта
 * файлов-бочек: файл `core/supabase/index.ts` реэкспортирует всё подряд и
 * делает достижимым что угодно. Достижимость файла и достижимость символа —
 * разные вопросы, на этом я уже обжигался.
 *
 * Ничего не пишет.
 */
const fs = require('fs')
const path = require('path')

const ENTRIES = ['src/index.ts', 'src/bot.ts']

/** Файлы-бочки: только реэкспорт, собственного кода нет. */
function isBarrel(file) {
  if (!file.endsWith('index.ts')) return false
  const text = fs.readFileSync(file, 'utf8')
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*'))
  const reexports = lines.filter(l => /^export .* from /.test(l) || /^import .* from /.test(l))
  return reexports.length / (lines.length || 1) > 0.8
}

const all = []
;(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (p.endsWith('.ts')) all.push(p)
  }
})('src')

const exists = new Set(all)

/** Разрешает путь импорта в файл проекта. */
function resolve(spec, from) {
  let base
  if (spec.startsWith('@/')) base = path.join('src', spec.slice(2))
  else if (spec.startsWith('.')) base = path.join(path.dirname(from), spec)
  else return null
  for (const c of [base + '.ts', path.join(base, 'index.ts')]) {
    if (exists.has(c)) return c
  }
  return null
}

function importsOf(file) {
  const text = fs.readFileSync(file, 'utf8')
  const out = new Set()
  for (const m of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const r = resolve(m[1], file)
    if (r) out.add(r)
  }
  for (const m of text.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const r = resolve(m[1], file)
    if (r) out.add(r)
  }
  return [...out]
}

/** Обход от точек входа. skipBarrels — не проходить сквозь бочки. */
function reachable(skipBarrels) {
  const seen = new Set()
  const queue = ENTRIES.filter(e => exists.has(e))
  while (queue.length) {
    const f = queue.pop()
    if (seen.has(f)) continue
    seen.add(f)
    if (skipBarrels && f !== ENTRIES[0] && f !== ENTRIES[1] && isBarrel(f)) continue
    for (const next of importsOf(f)) if (!seen.has(next)) queue.push(next)
  }
  return seen
}

const withBarrels = reachable(false)
const withoutBarrels = reachable(true)

/** Места, где пишется новое поле, добавленное в последних итерациях. */
const TREATMENTS = [
  { what: 'причина возврата (refund_reason)', file: 'src/price/helpers/refundUser.ts', marker: 'refund_reason' },
  { what: 'правда о возврате (refundAndTell)', file: 'src/price/helpers/refundAndTell.ts', marker: 'REFUND FAILED' },
  { what: 'исход генерации (prompts_history.status)', file: 'src/core/supabase/savePrompt.ts', marker: 'status: outcome' },
  { what: 'признак записи видео', file: 'src/core/supabase/saveVideoUrlToSupabase.ts', marker: 'РЕЗУЛЬТАТ НЕ ЗАПИСАН' },
  { what: 'проверка признака записи', file: 'src/modules/videoGenerator/helpers/supabaseHelper.ts', marker: 'if (!saved)' },
  { what: 'награда за приглашение', file: 'src/core/referral/rewardInviter.ts', marker: 'REFERRAL_BONUS_STARS' },
  { what: 'промо: отказ закрытый', file: 'src/helpers/promoHelper.ts', marker: 'промо НЕ выдаём' },
]

console.log(`файлов: ${all.length}`)
console.log(`достижимо через бочки: ${withBarrels.size}`)
console.log(`достижимо БЕЗ бочек:   ${withoutBarrels.size}\n`)

/** Имена, экспортируемые файлом. */
function exportedNames(file) {
  const text = fs.readFileSync(file, 'utf8')
  const names = new Set()
  for (const m of text.matchAll(
    /export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/g
  )) names.add(m[1])
  for (const m of text.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim()
      if (name) names.add(name)
    }
  }
  return [...names]
}

/** Достижимые файлы, зовущие хоть одно из имён, экспортируемых `file`. */
function liveCallers(file) {
  const names = exportedNames(file)
  return [...withBarrels].filter(f => {
    if (f === file || f.includes('__tests__') || f.includes('/test/')) return false
    const text = fs.readFileSync(f, 'utf8')
    return names.some(n => new RegExp(`\\b${n}\\s*\\(`).test(text))
  })
}

console.log('=== Будет ли исполняться то, что я починил ===')
console.log('(«достижим через бочку» ничего не значит — проверяем ЗОВЁТ ли кто-то)\n')
for (const t of TREATMENTS) {
  const src = fs.existsSync(t.file) ? fs.readFileSync(t.file, 'utf8') : ''
  const present = src.includes(t.marker)
  const callers = present ? liveCallers(t.file) : []
  const verdict = !present
    ? '❌ ПРАВКИ НЕТ В ФАЙЛЕ'
    : callers.length
      ? '✅ зовут'
      : '❌ НИКТО НЕ ЗОВЁТ'
  console.log(`  ${verdict.padEnd(22)} ${t.what}`)
  console.log(
    `      ${t.file}${callers.length ? `\n      ← ${callers.slice(0, 2).map(c => c.replace('src/', '')).join(', ')}${callers.length > 2 ? ` и ещё ${callers.length - 2}` : ''}` : ''}`
  )
}

// --- Кто вызывает savePrompt и зовёт ли ИХ хоть кто-то ------------------
//
// «Достижим только через бочку» само по себе ничего не значит: импорт через
// `@/services` — законный способ. Поэтому проверяем не файл, а СИМВОЛ: есть ли
// достижимый файл, который зовёт эту функцию по имени.
console.log('\n=== Вызывающие savePrompt: зовёт ли их кто-нибудь живой ===')

/** Имена, экспортируемые файлом. */
function exportedNames(file) {
  const text = fs.readFileSync(file, 'utf8')
  const names = new Set()
  for (const m of text.matchAll(
    /export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/g
  )) names.add(m[1])
  for (const m of text.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim()
      if (name) names.add(name)
    }
  }
  return [...names]
}

const callers = all.filter(f => {
  if (f.includes('__tests__') || f.includes('/test/')) return false
  if (f.endsWith('savePrompt.ts') || f.endsWith('savePromptDirect.ts')) return false
  return /\bsavePrompt\s*\(/.test(fs.readFileSync(f, 'utf8'))
})

let live = 0
for (const c of callers) {
  const names = exportedNames(c)
  // Кто из ДОСТИЖИМЫХ файлов зовёт хоть одно из этих имён.
  const users = [...withBarrels].filter(f => {
    if (f === c || f.includes('__tests__') || f.includes('/test/')) return false
    const text = fs.readFileSync(f, 'utf8')
    return names.some(n => new RegExp(`\\b${n}\\s*\\(`).test(text))
  })
  const ok = users.length > 0
  if (ok) live++
  console.log(
    `  ${ok ? '✅' : '❌'} ${c.padEnd(58)} зовущих: ${users.length}${users.length ? ' → ' + users[0].replace('src/', '') : ''}`
  )
}
console.log(`  итого: ${live} из ${callers.length} кто-то зовёт`)
