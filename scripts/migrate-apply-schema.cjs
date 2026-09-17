#!/usr/bin/env node
/** Applies scripts/migrate-schema.sql to the Railway Postgres. Idempotent-ish:
 *  the DDL is wrapped in BEGIN/COMMIT, so a failure leaves nothing behind. */
const { Client } = require('pg')
const fs = require('fs')
;(async () => {
  const sql = fs.readFileSync(__dirname + '/migrate-schema.sql', 'utf8')
  const c = new Client({
    connectionString:
      process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  await c.query(sql)
  const t = await c.query(
    "select table_name from information_schema.tables where table_schema='public' order by 1"
  )
  console.log('tables now:', t.rows.map(r => r.table_name).join(', '))
  await c.end()
})().catch(e => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
