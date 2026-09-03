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
// The matcher control runs BEFORE any credential is touched, on purpose. What
// it checks is the reader, not the connection, so it must be verifiable with no
// production access at all -- which is also the answer to "a live-data probe
// cannot have a stable sample".
/**
 * The reader, callable on a sample.
 *
 * It was inline in the fetch loop, so it could not be pointed at a known body --
 * and this probe exists precisely because the raw text says something JSON.parse
 * destroys: a trailing zero. If the regex stopped matching, every histogram
 * would come back empty and read as "the column holds no decimals", which is an
 * answer, not an error.
 */
function scanBody(text, hist, maxIntDigits, samples) {
  // Re-scan the raw text per row using a regex so trailing zeros survive.
  for (const m of text.matchAll(
    /"(amount|stars|cost)":(-?\d+(?:\.\d+)?|null)/g
  )) {
    const col = m[1]
    const lit = m[2]
    if (lit === 'null') {
      hist[col].NULL = (hist[col].NULL || 0) + 1
      continue
    }
    const dot = lit.indexOf('.')
    const scale = dot === -1 ? 0 : lit.length - dot - 1
    hist[col][scale] = (hist[col][scale] || 0) + 1
    const intPart = (dot === -1 ? lit : lit.slice(0, dot)).replace('-', '')
    if (intPart.length > maxIntDigits[col]) maxIntDigits[col] = intPart.length
    if (samples[col].size < 8) samples[col].add(lit)
  }
}

/**
 * A control IS possible here, which is the point of writing it.
 *
 * These probes were all filed as "a stable sample may not exist, because it
 * depends on production rows". That is true of the DATA and false of the
 * MATCHER: the reader above is a pure function of a response body, so a
 * synthetic body controls it completely and touches nothing live.
 *
 * POSITIVE: a body carrying the three shapes that matter -- a decimal whose
 * TRAILING ZERO must survive (the whole reason this probe reads raw text rather
 * than parsed JSON), an integer, and a null.
 *
 * NEGATIVE: two bodies that must contribute nothing, each rejected by a
 * DIFFERENT part of the pattern -- a similarly named column, and a value quoted
 * as a string rather than written as a JSON number.
 */
function selfCheck() {
  const fresh = () => ({
    hist: { amount: {}, stars: {}, cost: {} },
    max: { amount: 0, stars: 0, cost: 0 },
    samples: { amount: new Set(), stars: new Set(), cost: new Set() },
  })
  const POSITIVE = '[{"amount":12.340,"stars":5,"cost":null}]'
  const NEGATIVE = '[{"amount_usd":1.5,"amount":"12.34"}]'

  let c = fresh()
  scanBody(POSITIVE, c.hist, c.max, c.samples)
  const ok =
    c.hist.amount[3] === 1 && // trailing zero survived: scale 3, not 2
    c.hist.stars[0] === 1 &&
    c.hist.cost.NULL === 1 &&
    c.max.amount === 2
  if (!ok) {
    console.error(
      'самопроверка не прошла: заведомое тело разобрано неверно ' +
        JSON.stringify({ hist: c.hist, max: c.max }) +
        '.\n' +
        'пустые гистограммы ниже означали бы сломанный разбор, а не отсутствие дробных.'
    )
    process.exit(2)
  }
  c = fresh()
  scanBody(NEGATIVE, c.hist, c.max, c.samples)
  const counted =
    Object.keys(c.hist.amount).length +
    Object.keys(c.hist.stars).length +
    Object.keys(c.hist.cost).length
  if (counted !== 0) {
    console.error(
      'самопроверка не прошла: посчитаны похожая колонка или строковое значение ' +
        JSON.stringify(c.hist) +
        '.'
    )
    process.exit(2)
  }
  console.log(
    'самопроверка: хвостовой ноль сохранён, посторонние значения отвергнуты'
  )
}

selfCheck()

const url = process.env.SUPABASE_URL.replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

const COLS = ['amount', 'stars', 'cost']

async function main() {
  const hist = {}
  const maxIntDigits = {}
  const samples = {}
  for (const c of COLS) {
    hist[c] = {}
    maxIntDigits[c] = 0
    samples[c] = new Set()
  }

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
    scanBody(text, hist, maxIntDigits, samples)
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
main().catch(e => {
  console.error('ERR', e.message)
  process.exit(1)
})
