const { Client } = require('pg')
const fs = require('fs')
;(async () => {
  const f = process.argv[2]
  const c = new Client({
    connectionString:
      process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  await c.query(fs.readFileSync(f, 'utf8'))
  const r = await c.query(
    "select rolname from pg_roles where rolname in ('anon','authenticated','service_role') order by 1"
  )
  console.log('roles:', r.rows.map(x => x.rolname).join(', '))
  await c.end()
})().catch(e => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
