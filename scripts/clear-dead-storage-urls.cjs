#!/usr/bin/env node
/**
 * Очищает ссылки на объекты хранилища, которых больше нет ни в Supabase, ни в
 * MinIO.
 *
 *   railway run --service <Postgres> -- node scripts/clear-dead-storage-urls.cjs
 *   railway run --service <Postgres> -- node scripts/clear-dead-storage-urls.cjs --apply
 *
 * ОБРАТИМО. Перед очисткой каждое значение уходит в таблицу
 * dead_storage_urls_backup вместе с таблицей, первичным ключом и колонкой,
 * откуда взято. Откат — один UPDATE из этой таблицы.
 *
 * ЧТО НЕ ТРОГАЕТСЯ И ПОЧЕМУ
 * avatars.avatar_url и model_trainings.zip_url объявлены NOT NULL, поэтому
 * очистить их нечем: пустая строка не лучше мёртвой ссылки, а придумывать
 * подставное значение — прятать потерю. Такие строки только пересчитываются и
 * перечисляются, чтобы решение по ним принималось осознанно.
 */
const { Client } = require('pg')
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3')

const PG = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL
const MINIO_BUCKET = process.env.BUCKET_NAME || 'vibee-assets'
const APPLY = process.argv.includes('--apply')

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT_URL_S3,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

/** Только nullable-колонки: остальное очистить нечем. */
const CLEARABLE = [
  ['users', 'photo_url', 'id'],
  ['users', 'avatar_url', 'id'],
]
/** NOT NULL — сюда только отчёт. */
const REPORT_ONLY = [
  ['avatars', 'avatar_url', 'bot_name'],
  ['model_trainings', 'zip_url', 'id'],
]

const SUPA =
  /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/

/** Живая ли ссылка: сначала HEAD по самому URL, затем — по объекту в MinIO. */
async function isAlive(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' })
    if (r.ok) return true
  } catch {
    /* сеть — не приговор, проверим бакет */
  }

  const m = SUPA.exec(url)
  if (m) {
    try {
      await s3.send(
        new HeadObjectCommand({ Bucket: MINIO_BUCKET, Key: `${m[1]}/${m[2]}` })
      )
      return true
    } catch {
      return false
    }
  }
  return false
}

async function ensureBackup(c) {
  await c.query(`
    CREATE TABLE IF NOT EXISTS dead_storage_urls_backup (
      id           bigserial PRIMARY KEY,
      source_table text        NOT NULL,
      source_pk    text        NOT NULL,
      source_column text       NOT NULL,
      old_value    text        NOT NULL,
      cleared_at   timestamptz NOT NULL DEFAULT now()
    )`)
}

async function main() {
  console.log(APPLY ? '=== APPLY ===' : '=== DRY RUN (ничего не пишу) ===\n')
  const c = new Client({
    connectionString: PG,
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  if (APPLY) await ensureBackup(c)

  let cleared = 0,
    alive = 0

  for (const [table, col, pk] of CLEARABLE) {
    const { rows } = await c.query(
      `select "${pk}"::text as pk, "${col}" as url from "${table}"
        where "${col}" is not null and "${col}" <> '' and "${col}" like 'http%'`
    )
    let dead = 0,
      ok = 0
    for (const r of rows) {
      if (await isAlive(r.url)) {
        ok++
        continue
      }
      dead++
      if (APPLY) {
        await c.query(
          `insert into dead_storage_urls_backup (source_table, source_pk, source_column, old_value)
           values ($1,$2,$3,$4)`,
          [table, r.pk, col, r.url]
        )
        await c.query(
          `update "${table}" set "${col}" = NULL where "${pk}"::text = $1`,
          [r.pk]
        )
        cleared++
      }
    }
    alive += ok
    console.log(
      `  ${(table + '.' + col).padEnd(26)} всего ${String(rows.length).padStart(5)}  живых ${String(ok).padStart(4)}  мёртвых ${String(dead).padStart(5)}${APPLY ? ' -> очищено' : ''}`
    )
  }

  console.log('\n  NOT NULL, очистить нечем — только отчёт:')
  for (const [table, col, pk] of REPORT_ONLY) {
    const { rows } = await c.query(
      `select "${pk}"::text as pk, "${col}" as url from "${table}" where "${col}" like 'http%'`
    )
    const dead = []
    for (const r of rows) if (!(await isAlive(r.url))) dead.push(r.pk)
    console.log(
      `  ${(table + '.' + col).padEnd(26)} мёртвых ${dead.length}${dead.length ? ' -> ' + dead.slice(0, 5).join(', ') : ''}`
    )
  }

  await c.end()
  if (APPLY) {
    console.log(
      `\nочищено ${cleared} значений, копии в dead_storage_urls_backup`
    )
    console.log(
      'откат: update users u set photo_url = b.old_value from dead_storage_urls_backup b'
    )
    console.log(
      "       where b.source_table='users' and b.source_column='photo_url' and u.id::text=b.source_pk;"
    )
  } else {
    console.log('\nповторите с --apply')
  }
}

main().catch(e => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
