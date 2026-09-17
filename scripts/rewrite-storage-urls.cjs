#!/usr/bin/env node
/**
 * Переписывает сохранённые в базе ссылки на Supabase Storage в ссылки на MinIO.
 *
 *   railway run --service <Postgres> -- node scripts/rewrite-storage-urls.cjs
 *   railway run --service <Postgres> -- node scripts/rewrite-storage-urls.cjs --apply
 *
 * Объекты уже скопированы (724/724, 445 МБ) с сохранением ключей под префиксом
 * бакета, поэтому преобразование — чистая замена префикса:
 *
 *   https://<proj>.supabase.co/storage/v1/object/public/<bucket>/<key>
 *   -> https://<minio>/<MINIO_BUCKET>/<bucket>/<key>
 *
 * Мёртвые ссылки НЕ переписываются: если объекта нет ни в Supabase, ни в MinIO,
 * подмена хоста лишь замаскирует потерю. Такие строки только пересчитываются.
 */
const { Client } = require('pg')
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3')

const PG = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL
const MINIO_ENDPOINT = process.env.AWS_ENDPOINT_URL_S3
const MINIO_BUCKET = process.env.BUCKET_NAME || 'vibee-assets'
const APPLY = process.argv.includes('--apply')

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: MINIO_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

// Колонки, где по коду и по данным встречаются ссылки на хранилище.
const TARGETS = [
  ['avatars', 'avatar_url', 'bot_name'],
  ['model_trainings', 'zip_url', 'id'],
  ['model_trainings', 'model_url', 'id'],
  ['assets', 'public_url', 'id'],
  ['prompts_history', 'media_url', 'prompt_id'],
  ['users', 'avatar_url', 'id'],
  ['users', 'photo_url', 'id'],
]

const RE =
  /^https:\/\/([a-z0-9]+)\.supabase\.co\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/

function toMinio(url) {
  const m = RE.exec(url)
  if (!m) return null
  const [, project, bucket, key] = m
  return {
    project,
    bucket,
    key,
    next: `${MINIO_ENDPOINT}/${MINIO_BUCKET}/${bucket}/${key}`,
  }
}

async function inMinio(bucket, key) {
  try {
    await s3.send(
      new HeadObjectCommand({ Bucket: MINIO_BUCKET, Key: `${bucket}/${key}` })
    )
    return true
  } catch {
    return false
  }
}

async function main() {
  console.log(APPLY ? '=== APPLY ===' : '=== DRY RUN (ничего не пишу) ===')
  console.log('цель:', MINIO_ENDPOINT, '/', MINIO_BUCKET, '\n')

  const c = new Client({
    connectionString: PG,
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()

  let totalRewritable = 0,
    totalMissing = 0,
    totalUpdated = 0,
    totalForeign = 0

  for (const [table, col, pk] of TARGETS) {
    const { rows } = await c.query(
      `select "${pk}" as pk, "${col}" as url from "${table}"
        where "${col}" like 'https://%.supabase.co/storage/v1/object/public/%'`
    )
    if (!rows.length) {
      console.log(`  ${table}.${col}`.padEnd(34), '—')
      continue
    }

    let ok = 0,
      missing = 0,
      foreign = 0
    for (const r of rows) {
      const t = toMinio(r.url)
      if (!t) continue
      // Строки, указывающие на ДРУГОЙ проект Supabase, а не на наш: их объектов
      // в MinIO нет по определению, переписывать нечего.
      if (!(await inMinio(t.bucket, t.key))) {
        if (
          t.project !==
          new URL(
            process.env.SUPABASE_URL || 'https://x.supabase.co'
          ).hostname.split('.')[0]
        )
          foreign++
        else missing++
        continue
      }
      if (APPLY) {
        await c.query(
          `update "${table}" set "${col}" = $1 where "${pk}" = $2`,
          [t.next, r.pk]
        )
        totalUpdated++
      }
      ok++
    }
    totalRewritable += ok
    totalMissing += missing
    totalForeign += foreign
    console.log(
      `  ${(table + '.' + col).padEnd(32)} всего ${String(rows.length).padStart(4)}` +
        `  переписываемых ${String(ok).padStart(4)}` +
        `  нет объекта ${String(missing).padStart(4)}` +
        (foreign ? `  чужой проект ${foreign}` : '')
    )
  }

  await c.end()
  console.log(
    `\nпереписываемых ${totalRewritable}, без объекта ${totalMissing}, чужой проект ${totalForeign}`
  )
  if (APPLY) console.log(`обновлено строк: ${totalUpdated}`)
  else console.log('повторите с --apply')
}

main().catch(e => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
