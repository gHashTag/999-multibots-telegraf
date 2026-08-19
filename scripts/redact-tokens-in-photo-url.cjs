#!/usr/bin/env node
/**
 * Убирает из `users.photo_url` адреса, содержащие ТОКЕН БОТА.
 *
 * ПО УМОЛЧАНИЮ — СУХОЙ ПРОГОН. Запись только по флагу `--apply`.
 *
 * Что нашлось живым замером: 264 строки в `users.photo_url` содержат адреса
 * вида `https://api.telegram.org/file/bot<ТОКЕН>/<путь>`. Разных токенов — 14,
 * и шесть из них на момент проверки ДЕЙСТВУЮЩИЕ. Токен даёт полное управление
 * ботом.
 *
 * Информация при этом не теряется: такие адреса живут около часа, то есть все
 * 264 давно мертвы. Удаляется мёртвая ссылка вместе с секретом.
 *
 * ЭТО НЕ ЗАМЕНЯЕТ РОТАЦИЮ. Токены уже утекли; их надо перевыпустить у
 * @BotFather. Скрипт лишь убирает их из базы, чтобы не читались снова.
 *
 * Запуск владельцем:
 *   node scripts/redact-tokens-in-photo-url.cjs           сухой прогон
 *   node scripts/redact-tokens-in-photo-url.cjs --apply    запись
 */
const url = process.env.SUPABASE_URL.replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: key, Authorization: `Bearer ${key}` }
const APPLY = process.argv.includes('--apply')

const TOKEN_URL = /api\.telegram\.org\/file\/bot\d+:[A-Za-z0-9_-]+\//

async function fetchAll(table, select) {
  const out = []
  let from = 0
  for (;;) {
    const res = await fetch(`${url}/rest/v1/${table}?select=${select}`, {
      headers: { ...H, Range: `${from}-${from + 999}`, 'Range-Unit': 'items' },
    })
    if (!res.ok) throw new Error(`${table} ${res.status}`)
    const rows = await res.json()
    if (!rows.length) break
    out.push(...rows)
    if (rows.length < 1000) break
    from += 1000
  }
  return out
}

async function main() {
  const rows = await fetchAll('users', 'id,telegram_id,photo_url,bot_name')
  const bad = rows.filter(r => TOKEN_URL.test(String(r.photo_url || '')))

  const botIds = new Set()
  for (const r of bad) {
    const m = String(r.photo_url).match(/\/file\/bot(\d+):/)
    if (m) botIds.add(m[1])
  }

  console.log(`строк с токеном в photo_url: ${bad.length}`)
  console.log(`разных ботов: ${botIds.size} — ${[...botIds].join(', ')}`)
  console.log('(сами токены здесь не печатаются)')

  // Все ли такие ссылки уже мертвы — чтобы честно сказать, что теряется.
  let checked = 0
  let alive = 0
  for (const r of bad.slice(0, 5)) {
    try {
      const res = await fetch(r.photo_url, { method: 'HEAD', signal: AbortSignal.timeout(15000) })
      checked++
      if (res.ok) alive++
    } catch {
      checked++
    }
  }
  console.log(`проверено ссылок: ${checked}, из них рабочих: ${alive}`)

  if (!APPLY) {
    console.log('\nСУХОЙ ПРОГОН. Ничего не изменено.')
    console.log('Для записи: --apply. Перед этим перевыпустите токены у @BotFather.')
    return
  }

  console.log('\n=== ЗАПИСЬ: photo_url -> null ===')
  let done = 0
  for (const r of bad) {
    const res = await fetch(`${url}/rest/v1/users?id=eq.${r.id}`, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ photo_url: null }),
    })
    if (res.ok) done++
    else console.log(`  ✗ id=${r.id}: ${res.status}`)
  }
  console.log(`очищено строк: ${done} из ${bad.length}`)
}

main().catch(e => {
  console.error('ERR', e.message)
  process.exit(1)
})
