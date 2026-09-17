#!/usr/bin/env node
/**
 * READ-ONLY. Fetches the PostgREST OpenAPI (swagger 2.0) document from the
 * Supabase REST root. This document carries the authoritative Postgres type
 * for every exposed column, plus defaults, PK/FK notes and required-ness.
 *
 *   railway run --service <bot> -- node scripts/probe-openapi.cjs
 *
 * Writes the raw doc to /tmp/supabase-openapi.json and prints nothing secret.
 */
const fs = require('fs')

const url = process.env.SUPABASE_URL
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY')
  process.exit(1)
}

async function main() {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/openapi+json',
    },
  })
  console.log('HTTP', res.status, res.headers.get('content-type'))
  const text = await res.text()
  fs.writeFileSync('/tmp/supabase-openapi.json', text)
  console.log('bytes', text.length)
  if (res.status !== 200) console.log('BODY:', text.slice(0, 300))
  let doc
  try {
    doc = JSON.parse(text)
  } catch (e) {
    console.log('NOT JSON. First 500 chars:\n', text.slice(0, 500))
    return
  }
  const defs =
    doc.definitions || (doc.components && doc.components.schemas) || {}
  const names = Object.keys(defs)
  console.log('definitions:', names.length)
  console.log(names.join(', '))
  const paths = Object.keys(doc.paths || {}).filter(p => p.startsWith('/rpc/'))
  console.log('rpc paths:', paths.join(', '))
}

main().catch(e => {
  console.error('ERR', e.message)
  process.exit(1)
})
