#!/usr/bin/env node
/**
 * IGLA -- the rescue needle. "Игла" is Russian for needle; the project has a
 * sibling named for the same idea.
 *
 * Re-does the Supabase -> Railway transfer from nothing, as many times as you
 * like. Written on 2026-09-03 after the transfer was done by hand and the
 * knowledge of HOW lived only in a chat transcript.
 *
 * THREE PROPERTIES, AND EACH ONE IS THE REASON THIS FILE EXISTS.
 *
 * 1. IT ONLY ADDS. No UPDATE, no DELETE, no TRUNCATE, no ALTER. Every write is
 *    `INSERT ... ON CONFLICT DO NOTHING`. A row that already exists in the
 *    destination is left exactly as it is, even when the source disagrees --
 *    because the two databases have been authoritative for different tables at
 *    different times, and "newer" is not a property this script can judge.
 *
 * 2. IT REFUSES BY DEFAULT. Without `--apply` it only measures and prints. A
 *    data-moving tool whose default is to move data gets run by accident
 *    exactly once.
 *
 * 3. IT COMPARES SETS, NOT COUNTS. Equal counts do not mean equal contents:
 *    when this was measured by hand, users differed by 33 in total while the
 *    real gap was 34 missing one way and 1 missing the other. Counting would
 *    have hidden the reverse direction entirely.
 *
 * WHAT IT DOES NOT DO, ON PURPOSE.
 *
 *   - It does not copy stored FUNCTIONS. PostgREST cannot serve their source,
 *     and guessing the body of something like `get_user_balance` -- a function
 *     that decides how much money a person has -- is not a thing a script
 *     should do quietly. They are listed in the report as work for a human.
 *   - It does not switch any writer over. Pointing the bot at Railway is a
 *     separate, reversible act performed in Infisical, and mixing it into a
 *     copy would make a half-finished copy indistinguishable from a cutover.
 *   - It does not touch storage objects. That half lives in
 *     `scripts/storage-migration/` (branch codex/root-supabase-exit-20260825).
 *
 * USAGE
 *
 *   node scripts/supabase-exit/igla.mjs              # measure, change nothing
 *   node scripts/supabase-exit/igla.mjs --apply      # copy what is missing
 *   node scripts/supabase-exit/igla.mjs --table users --apply
 *
 * CREDENTIALS are read from the environment first, and pulled from the Railway
 * CLI only if the environment is silent:
 *
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   -- the source
 *   RAILWAY_PG_URL                            -- the destination
 *
 * NOTE ON THE SERVICE KEY. `SUPABASE_SERVICE_KEY` is MISNAMED in this project:
 * its JWT decodes to `role=anon`. The one that can read everything is
 * `SUPABASE_SERVICE_ROLE_KEY`. Measured 2026-09-03; do not "simplify" this.
 */

import { execFileSync } from 'node:child_process'
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

/**
 * Tables the transfer covers, and the column that identifies a row.
 *
 * The key is NOT always the primary key. For `users` the primary key is `id`,
 * but identity is `telegram_id`: the same person can hold two rows (there are
 * ~35 such duplicates on both sides, which is why `deduplicateUsers.ts`
 * exists), and comparing by `id` would call those two different people.
 */
const TABLES = [
  { name: 'users', key: 'telegram_id' },
  { name: 'payments_v2', key: 'id' },
  { name: 'assets', key: 'id' },
  { name: 'user_feature_views', key: 'id' },
  // Not `id` -- this table's primary key IS the idempotency key. Reading it as
  // `id` made the first run report the table as unreadable rather than as
  // empty, which is a different problem and would have sent the next person
  // looking for a permissions fault.
  { name: 'idempotency_keys', key: 'idempotency_key' },
  { name: 'instagram_apify_reels', key: 'id' },
  { name: 'game', key: 'id' },
]

/**
 * Functions the bot calls through `.rpc(...)`. They exist in the cloud and not
 * in Railway; PostgREST will not hand over their source, so this script cannot
 * move them. Listed so the report never claims a transfer is complete while
 * the bot would still break on a cutover.
 */
const FUNCTIONS_THE_BOT_CALLS = [
  'get_user_balance',
  'get_user_balance_stats',
  'increment_attempts',
]

const APPLY = process.argv.includes('--apply')
const ONLY = (() => {
  const i = process.argv.indexOf('--table')
  return i >= 0 ? process.argv[i + 1] : null
})()

function railwayVar(service, name) {
  try {
    const out = execFileSync(
      'railway',
      ['variables', '--service', service, '--kv'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    )
    const line = out.split('\n').find(l => l.startsWith(`${name}=`))
    return line ? line.slice(name.length + 1).trim() : null
  } catch {
    return null
  }
}

const SRC_URL = (
  process.env.SUPABASE_URL ||
  railwayVar('999-multibots-telegraf', 'SUPABASE_URL') ||
  ''
).replace(/\/$/, '')
const SRC_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  railwayVar('999-multibots-telegraf', 'SUPABASE_SERVICE_ROLE_KEY') ||
  ''
const DST_URL =
  process.env.RAILWAY_PG_URL ||
  railwayVar('Postgres-NFrq', 'DATABASE_PUBLIC_URL') ||
  ''

if (!SRC_URL || !SRC_KEY || !DST_URL) {
  console.error(
    'Не хватает доступов. Нужны SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY и\n' +
      'RAILWAY_PG_URL — в окружении или через залогиненный railway CLI.'
  )
  process.exit(2)
}

/** One PostgREST page. 1000 is the server's own ceiling, not our choice. */
const PAGE = 1000

async function rest(pathAndQuery, { range } = {}) {
  const headers = {
    apikey: SRC_KEY,
    Authorization: `Bearer ${SRC_KEY}`,
  }
  if (range) headers.Range = range
  const r = await fetch(`${SRC_URL}/rest/v1/${pathAndQuery}`, { headers })
  if (!r.ok && r.status !== 206) {
    throw new Error(`PostgREST ${r.status}: ${(await r.text()).slice(0, 200)}`)
  }
  return r.json()
}

/** Every value of `key` in the source, paged to the end. */
async function sourceKeys(table, key) {
  const out = new Set()
  for (let off = 0; ; off += PAGE) {
    const rows = await rest(`${table}?select=${key}&order=${key}.asc`, {
      range: `${off}-${off + PAGE - 1}`,
    })
    for (const r of rows) out.add(String(r[key]))
    if (rows.length < PAGE) break
  }
  return out
}

function psql(sql, { file } = {}) {
  const args = ['-tAX', '-v', 'ON_ERROR_STOP=1', DST_URL]
  if (file) args.push('-f', file)
  else args.push('-c', sql)
  return execFileSync('psql', args, { encoding: 'utf8' }).trim()
}

function destKeys(table, key) {
  const raw = psql(`select ${key} from ${table};`)
  return new Set(
    raw
      ? raw
          .split('\n')
          .map(s => s.trim())
          .filter(Boolean)
      : []
  )
}

function tableExists(table) {
  return psql(`select to_regclass('public.${table}') is not null;`) === 't'
}

/** Fetch full rows for a set of keys, in chunks the URL can carry. */
async function fetchRows(table, key, keys) {
  const rows = []
  const list = [...keys]
  for (let i = 0; i < list.length; i += 200) {
    const chunk = list.slice(i, i + 200).join(',')
    rows.push(...(await rest(`${table}?select=*&${key}=in.(${chunk})`)))
  }
  return rows
}

/**
 * Insert rows through `json_populate_recordset`, which maps BY COLUMN NAME.
 *
 * Enumerating columns by hand would be a second copy of the schema, and the
 * two would drift; `users` alone has 42 columns. Mapping by name also means a
 * column added on one side and not the other fails loudly here instead of
 * silently shifting every value one place to the left.
 */
function insertRows(table, rows) {
  if (!rows.length) return 0
  const dir = mkdtempSync(path.join(tmpdir(), 'igla-'))
  const jsonPath = path.join(dir, `${table}.json`)
  const sqlPath = path.join(dir, `${table}.sql`)
  try {
    writeFileSync(jsonPath, JSON.stringify(rows), { mode: 0o600 })
    writeFileSync(
      sqlPath,
      `\\set payload \`cat ${jsonPath}\`\n` +
        `INSERT INTO ${table}\n` +
        `SELECT * FROM json_populate_recordset(null::${table}, :'payload'::json)\n` +
        `ON CONFLICT DO NOTHING;\n`,
      { mode: 0o600 }
    )
    const out = psql(null, { file: sqlPath })
    const m = out.match(/INSERT \d+ (\d+)/)
    return m ? Number(m[1]) : 0
  } finally {
    for (const f of [jsonPath, sqlPath]) {
      try {
        unlinkSync(f)
      } catch {
        /* the temp dir goes with the machine; a leftover file is not a failure */
      }
    }
  }
}

const pad = (s, n) => String(s).padEnd(n)

async function main() {
  console.log(
    APPLY
      ? '🪡  ИГЛА: перенос (только добавление, ничего не удаляется)\n'
      : '🔍  ИГЛА: замер. Ничего не пишется. Для переноса добавьте --apply\n'
  )
  console.log(
    `${pad('таблица', 24)} ${pad('источник', 10)} ${pad('приёмник', 10)} ${pad('не хватает', 12)} ${pad('лишних тут', 12)} итог`
  )

  let totalCopied = 0
  let anyReverse = false

  for (const t of TABLES) {
    if (ONLY && t.name !== ONLY) continue
    if (!tableExists(t.name)) {
      console.log(
        `${pad(t.name, 24)} ${pad('—', 10)} ${pad('НЕТ ТАБЛИЦЫ', 10)} — требуется создать схему`
      )
      continue
    }
    let src
    try {
      src = await sourceKeys(t.name, t.key)
    } catch (e) {
      console.log(
        `${pad(t.name, 24)} источник недоступен: ${String(e.message).slice(0, 60)}`
      )
      continue
    }
    const dst = destKeys(t.name, t.key)
    const missing = [...src].filter(k => !dst.has(k))
    const reverse = [...dst].filter(k => !src.has(k))
    if (reverse.length) anyReverse = true

    let verdict = missing.length ? 'нужен перенос' : 'сходится'
    if (APPLY && missing.length) {
      const rows = await fetchRows(t.name, t.key, missing)
      const n = insertRows(t.name, rows)
      totalCopied += n
      verdict = `перенесено ${n}`
    }

    console.log(
      `${pad(t.name, 24)} ${pad(src.size, 10)} ${pad(dst.size, 10)} ${pad(missing.length, 12)} ${pad(reverse.length, 12)} ${verdict}`
    )
  }

  console.log()
  if (anyReverse) {
    console.log(
      '⚠️  Есть строки, которых нет в ИСТОЧНИКЕ. Это не ошибка: приёмник был\n' +
        '   главным для части таблиц. Игла их не трогает — она только добавляет.'
    )
  }

  const missingFns = FUNCTIONS_THE_BOT_CALLS.filter(
    f =>
      psql(
        `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace ` +
          `where n.nspname='public' and p.proname='${f}';`
      ) === '0'
  )
  if (missingFns.length) {
    console.log(
      `⛔  В приёмнике НЕТ функций, которые зовёт бот: ${missingFns.join(', ')}.\n` +
        '   Игла их не переносит: PostgREST не отдаёт исходник, а угадывать тело\n' +
        '   функции, считающей чужой баланс, нельзя. Пока их нет — переключать\n' +
        '   бота на Railway рано, сколько бы строк ни было скопировано.'
    )
  }

  if (APPLY) console.log(`\nВсего перенесено строк: ${totalCopied}`)
}

main().catch(e => {
  console.error('Игла остановилась:', e.message)
  process.exit(1)
})
