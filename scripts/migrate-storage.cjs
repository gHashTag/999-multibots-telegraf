#!/usr/bin/env node
/**
 * Copies Supabase Storage objects into the MinIO bucket on Railway.
 *
 *   railway run --service <Postgres> -- node scripts/migrate-storage.cjs        # dry run
 *   railway run --service <Postgres> -- node scripts/migrate-storage.cjs --apply
 *
 * Six buckets, not one: images, landingpage, leelachakra, dev, ai-training,
 * sync-labs. 724 objects, ~445 MB.
 *
 * Keys are preserved under a per-bucket prefix, so
 *   landingpage/avatars/x.jpg  ->  <MINIO_BUCKET>/landingpage/avatars/x.jpg
 * which keeps the rewrite from Supabase URL to MinIO URL a pure prefix swap.
 */
const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3')

const SUPABASE_URL = process.env.SUPABASE_URL
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
const APPLY = process.argv.includes('--apply')

const MINIO_ENDPOINT =
  process.env.AWS_ENDPOINT_URL_S3 ||
  'https://bucket-production-8259.up.railway.app'
const MINIO_BUCKET = process.env.BUCKET_NAME || 'vibee-assets'

const BUCKETS = [
  'images',
  'landingpage',
  'leelachakra',
  'dev',
  'ai-training',
  'sync-labs',
]

if (!SUPABASE_URL || !KEY) {
  console.error('need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: MINIO_ENDPOINT,
  forcePathStyle: true, // MinIO addresses the bucket by path, not subdomain
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

/** Recursively list a Supabase bucket; its list API is per-prefix, not global. */
async function listAll(bucket, prefix = '') {
  const out = []
  let offset = 0
  for (;;) {
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/list/${bucket}`,
      {
        method: 'POST',
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prefix,
          limit: 100,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        }),
      }
    )
    if (!res.ok) throw new Error(`list ${bucket}/${prefix}: ${res.status}`)
    const page = await res.json()
    if (!page.length) break

    for (const it of page) {
      const key = prefix ? `${prefix}/${it.name}` : it.name
      // A folder has no id; only leaves carry metadata.
      if (it.id === null || it.id === undefined)
        out.push(...(await listAll(bucket, key)))
      else
        out.push({
          key,
          size: it.metadata?.size ?? 0,
          type: it.metadata?.mimetype,
        })
    }

    if (page.length < 100) break
    offset += 100
  }
  return out
}

async function existsInMinio(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: MINIO_BUCKET, Key: key }))
    return true
  } catch {
    return false
  }
}

async function main() {
  console.log(APPLY ? '=== APPLY ===' : '=== DRY RUN (no writes) ===')
  console.log('target:', MINIO_ENDPOINT, '/', MINIO_BUCKET, '\n')

  let total = 0,
    bytes = 0,
    copied = 0,
    skipped = 0,
    failed = 0

  for (const bucket of BUCKETS) {
    let objects = []
    try {
      objects = await listAll(bucket)
    } catch (e) {
      console.log(`  ${bucket.padEnd(14)} LIST FAILED: ${e.message}`)
      continue
    }
    const b = objects.reduce((a, o) => a + (o.size || 0), 0)
    total += objects.length
    bytes += b
    console.log(
      `  ${bucket.padEnd(14)} ${String(objects.length).padStart(4)} objects  ${(b / 1048576).toFixed(1)} MB`
    )

    if (!APPLY) continue

    for (const o of objects) {
      const destKey = `${bucket}/${o.key}`
      if (await existsInMinio(destKey)) {
        skipped++
        continue
      }

      const src = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${o.key}`
      try {
        const r = await fetch(src, {
          headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
        })
        if (!r.ok) {
          failed++
          console.log(`    MISS ${r.status} ${destKey}`)
          continue
        }
        const body = Buffer.from(await r.arrayBuffer())
        await s3.send(
          new PutObjectCommand({
            Bucket: MINIO_BUCKET,
            Key: destKey,
            Body: body,
            ContentType:
              o.type ||
              r.headers.get('content-type') ||
              'application/octet-stream',
          })
        )
        copied++
      } catch (e) {
        failed++
        console.log(`    FAIL ${destKey}: ${e.message}`)
      }
    }
  }

  console.log(`\ntotal ${total} objects, ${(bytes / 1048576).toFixed(1)} MB`)
  if (APPLY)
    console.log(
      `copied ${copied}, already present ${skipped}, failed ${failed}`
    )
  else console.log('re-run with --apply to copy')
}

main().catch(e => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
