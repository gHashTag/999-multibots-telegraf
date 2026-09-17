#!/usr/bin/env node
/**
 * READ-ONLY. Сверяет имена таблиц в коде с тем, что реально есть в базе.
 *
 * Последний неразобранный класс швов. Симптом уже видели: сцена парсинга пишет
 * в `instagram_scrapings`, а такой таблицы нет — PostgREST отвечает 400, и это
 * никого не останавливает, потому что результат вставки не проверяется.
 *
 * Тот же почерк, что у маршрутов и событий: имя — строка, она проходит типы,
 * сборку и деплой. Ошибка всплывает в проде и только в логах.
 *
 * Ничего не пишет.
 */
const fs = require('fs')
const path = require('path')

const url = process.env.SUPABASE_URL.replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: key, Authorization: `Bearer ${key}` }

const strip = s =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const files = []
;(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (p.endsWith('.ts')) files.push(p)
  }
})('src')

/**
 * `.from('имя')` — но НЕ `storage.from('имя')`.
 *
 * Первая версия ловила и то и другое, и самым «страшным» результатом оказался
 * `images` с 48 обращениями — а это бакет файлового хранилища, а не таблица.
 * Он существует. Цифру пришлось выбросить и пересчитать: инструмент,
 * завышающий находки, обесценивает и настоящие.
 *
 * Отсекаем по предшествующему `storage` в пределах той же строки или
 * предыдущей — вызов обычно записан как
 *   supabase.storage
 *     .from('images')
 */
const used = new Map()
for (const f of files) {
  if (f.includes('__tests__') || f.includes('/test/')) continue
  const src = strip(fs.readFileSync(f, 'utf8'))
  const lines = src.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/\.from\(\s*['"]([a-z0-9_]+)['"]\s*\)/i)
    if (!m) continue
    const context = (lines[i - 1] || '') + '\n' + lines[i]
    if (/\bstorage\b/.test(context)) continue
    if (!used.has(m[1])) used.set(m[1], [])
    used.get(m[1]).push(`${f}:${i + 1}`)
  }
}

async function tableExists(name) {
  // HEAD с count: если таблицы нет, PostgREST отвечает 404/400 с кодом 42P01.
  const res = await fetch(`${url}/rest/v1/${name}?select=*&limit=0`, {
    headers: { ...H, Prefer: 'count=exact', Range: '0-0' },
  })
  if (res.ok) {
    const cr = res.headers.get('content-range') || ''
    return { ok: true, count: cr.split('/')[1] ?? '?' }
  }
  const body = await res.text()
  return { ok: false, status: res.status, detail: body.slice(0, 120) }
}

async function main() {
  const names = [...used.keys()].sort()
  console.log(`имён таблиц в коде: ${names.length}\n`)

  const missing = []
  const present = []

  for (const name of names) {
    const r = await tableExists(name)
    if (r.ok) present.push([name, r.count])
    else missing.push([name, r.status, r.detail])
  }

  console.log(`=== ЕСТЬ В БАЗЕ: ${present.length} ===`)
  for (const [name, count] of present) {
    console.log(`  ${name.padEnd(34)} строк ${count}`)
  }

  console.log(`\n=== НЕТ В БАЗЕ: ${missing.length} ===`)
  console.log('   (код пишет или читает несуществующую таблицу)\n')
  for (const [name, status, detail] of missing) {
    console.log(`  ${name}   [HTTP ${status}]`)
    console.log(`      ${detail.replace(/\s+/g, ' ')}`)
    for (const where of used.get(name).slice(0, 6))
      console.log(`      ${where}`)
    if (used.get(name).length > 6)
      console.log(`      ... ещё ${used.get(name).length - 6}`)
  }

  // Отдельно: пустые таблицы, в которые пишут — признак, что запись не доходит.
  const emptyButWritten = present.filter(([name, count]) => {
    if (String(count) !== '0') return false
    return used.get(name).length > 0
  })
  if (emptyButWritten.length) {
    console.log(`\n=== ЕСТЬ, НО ПУСТЫЕ: ${emptyButWritten.length} ===`)
    console.log('   (таблица заведена, код к ней обращается, строк ноль)\n')
    for (const [name] of emptyButWritten) {
      console.log(`  ${name}  — обращений в коде: ${used.get(name).length}`)
      for (const where of used.get(name).slice(0, 3))
        console.log(`      ${where}`)
    }
  }
}

main().catch(e => {
  console.error('ERR', e.message)
  process.exit(1)
})
