const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3')
const s3 = new S3Client({
  region: 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT_URL_S3,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})
const WANT = {
  images: 430,
  landingpage: 213,
  leelachakra: 74,
  dev: 3,
  'ai-training': 2,
  'sync-labs': 2,
}
;(async () => {
  const by = {}
  let n = 0,
    bytes = 0,
    token
  do {
    const r = await s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.BUCKET_NAME,
        ContinuationToken: token,
      })
    )
    for (const o of r.Contents || []) {
      n++
      bytes += o.Size || 0
      const p = o.Key.split('/')[0]
      by[p] = (by[p] || 0) + 1
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined
  } while (token)
  let d = 0,
    w = 0
  for (const [k, v] of Object.entries(WANT)) {
    const g = by[k] || 0
    d += g
    w += v
    console.log(
      `  ${k.padEnd(13)} ${String(g).padStart(4)}/${String(v).padEnd(4)} ${g >= v ? '✓' : ''}`
    )
  }
  console.log(
    `  ${d}/${w} (${((d / w) * 100).toFixed(0)}%), ${(bytes / 1048576).toFixed(0)} MB`
  )
})().catch(e => {
  console.error(e.message)
  process.exit(1)
})
