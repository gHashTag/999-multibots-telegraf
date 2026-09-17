#!/usr/bin/env node
/**
 * Determines whether integer PKs are IDENTITY columns, and reads max PK values
 * (needed to seed sequences on Railway).
 *
 * Technique: POST a body that OMITS the pk and sets a known NOT NULL,
 * no-default column to null. The statement can never succeed, so nothing is
 * written. Postgres evaluates column defaults BEFORE checking NOT NULL, and
 * reports the first violating column in attnum order.
 *   -> error names the PK   => PK has no default and no identity
 *   -> error names the bait => PK default/identity fired
 * Side effect: if the PK is an identity, its sequence advances by one. Gaps in
 * a sequence are harmless and this DB is being retired anyway.
 */
const url = process.env.SUPABASE_URL.replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const H = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
}

const CASES = [
  ['payments_v2', 'id', 'telegram_id'],
  ['assets', 'id', 'type'],
  ['prompts_history', 'prompt_id', 'prompt'],
  ['translations', 'id', 'language_code'],
  ['superhero_generations', 'id', 'telegram_id'],
]

async function maxPk(table, pk) {
  const res = await fetch(
    `${url}/rest/v1/${table}?select=${pk}&order=${pk}.desc&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  )
  return (await res.text()).slice(0, 120)
}

async function main() {
  for (const [t, pk, bait] of CASES) {
    const res = await fetch(`${url}/rest/v1/${t}`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ [bait]: null }),
    })
    const body = await res.text()
    let j = {}
    try {
      j = JSON.parse(body)
    } catch {}
    const col = (j.message || '').match(/column "([^"]+)"/)
    console.log(
      `${t}.${pk}: HTTP ${res.status} code=${j.code} violating_col=${col ? col[1] : '?'}` +
        `  => PK ${col && col[1] === pk ? 'HAS NO DEFAULT (not identity)' : 'IS IDENTITY/defaulted'}`
    )
    console.log(`   msg: ${(j.message || body).slice(0, 160)}`)
    console.log(`   max(${pk}) = ${await maxPk(t, pk)}`)
  }
}
main().catch(e => {
  console.error('ERR', e.message)
  process.exit(1)
})
