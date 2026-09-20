import pg from 'pg'
const url = process.env.DATABASE_PUBLIC_URL
if (!url) {
  console.log('no DATABASE_PUBLIC_URL')
  process.exit(0)
}
const pool = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
})
const q = async (sql, p) => (await pool.query(sql, p)).rows
console.log(
  'by surface/kind:',
  await q(
    `SELECT surface, kind, "out", count(*)::int FROM user_media GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 20`
  )
)
console.log(
  'audio by surface:',
  await q(
    `SELECT surface, count(*)::int AS n, count(transcript)::int AS with_transcript, max(at) AS newest FROM user_media WHERE kind='audio' GROUP BY 1`
  )
)
console.log(
  'bot audio last 10:',
  await q(
    `SELECT at, surface, "out", name, bytes, (transcript IS NOT NULL) AS heard, length(transcript) AS chars FROM user_media WHERE kind='audio' AND surface='bot' ORDER BY at DESC NULLS LAST LIMIT 10`
  )
)
await pool.end()
