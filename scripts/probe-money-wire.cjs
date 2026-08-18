#!/usr/bin/env node
/**
 * READ-ONLY. Decides the exact scale of payments_v2.amount/stars/cost.
 *
 * Postgres stores numeric(p,s) rounded AND padded to s decimal places, and
 * to_json() renders the numeric's own text form. So the RAW HTTP body (before
 * JSON.parse, which collapses 100.00 -> 100) is the authoritative witness of
 * the declared scale. Unconstrained numeric keeps whatever scale was inserted,
 * so a mixed histogram proves there is no typmod.
 */
const url = process.env.SUPABASE_URL.replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

const COLS = ['amount', 'stars', 'cost']

async function main() {
  const hist = {}
  const maxIntDigits = {}
  const samples = {}
  for (const c of COLS) { hist[c] = {}; maxIntDigits[c] = 0; samples[c] = new Set() }

  let from = 0
  let total = 0
  for (;;) {
    const res = await fetch(
      `${url}/rest/v1/payments_v2?select=${COLS.join(',')}`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Range: `${from}-${from + 999}`,
          'Range-Unit': 'items',
        },
      }
    )
    const text = await res.text() // RAW — do not JSON.parse yet
    const rows = JSON.parse(text)
    if (!rows.length) break
    // Re-scan the raw text per row using a regex so trailing zeros survive.
    for (const m of text.matchAll(
      /"(amount|stars|cost)":(-?\d+(?:\.\d+)?|null)/g
    )) {
      const col = m[1]
      const lit = m[2]
      if (lit === 'null') { hist[col].NULL = (hist[col].NULL || 0) + 1; continue }
      const dot = lit.indexOf('.')
      const scale = dot === -1 ? 0 : lit.length - dot - 1
      hist[col][scale] = (hist[col][scale] || 0) + 1
      const intPart = (dot === -1 ? lit : lit.slice(0, dot)).replace('-', '')
      if (intPart.length > maxIntDigits[col]) maxIntDigits[col] = intPart.length
      if (samples[col].size < 8) samples[col].add(lit)
    }
    total += rows.length
    if (rows.length < 1000) break
    from += 1000
  }

  console.log('rows scanned:', total)
  for (const c of COLS) {
    console.log(`\n== ${c} ==`)
    console.log('  decimal-places histogram:', JSON.stringify(hist[c]))
    console.log('  max integer digits:', maxIntDigits[c])
    console.log('  raw literals seen:', [...samples[c]].join(', '))
  }
}
main().catch(e => { console.error('ERR', e.message); process.exit(1) })
