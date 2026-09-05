#!/usr/bin/env node
/**
 * ONE THING, TWO SPELLINGS: WHICH RATCHET SEES ONLY ONE OF THEM.
 *
 * A ratchet is a matcher plus a list. The matcher decides the population, so a
 * matcher that knows one spelling of a thing does not know the thing -- and the
 * ratchet then reports a clean repository about the half it cannot see.
 *
 * This has now happened four times, each found by accident rather than by
 * looking:
 *
 *   return '<url>'          vs  return { video_url: '<url>' }   (#1846)
 *   await f()               vs  const x = await f()             (#1842)
 *   PaymentType.MONEY_INCOME vs PaymentType.REFUND              (#1838)
 *   refund by description   vs  refund by type                  (#1839)
 *
 * So the pairs below are not hypothetical: every one of them was a real miss.
 * The probe runs each money ratchet's own regexes against both spellings and
 * reports the matchers that see exactly one.
 *
 * This is a READING LIST, not a verdict. A matcher is often narrow on purpose
 * -- CHARGE_PRIMITIVES deliberately ignores credits, and a rule about `return`
 * statements is entitled to ignore properties. What the output buys is the
 * question asked in one place instead of four accidents.
 */

const fs = require('fs')
const { repoFiles } = require('./lib/repo-sources.cjs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')

/**
 * Same concept, two spellings, both real in this repository.
 * `a` is the form matchers tend to know; `b` is the one they tend to miss.
 */
const PAIRS = [
  {
    concept: 'выдуманный адрес в возврате',
    a: "return 'https://stub.example.com/v.mp4'",
    b: "return { video_url: 'https://stub.example.com/v.mp4' }",
  },
  {
    concept: 'результат денежного вызова',
    a: '  await updateUserBalance(id, 1, t, d)',
    b: '  const ok = await updateUserBalance(id, 1, t, d)',
  },
  {
    concept: 'начисление на баланс',
    a: 'PaymentType.MONEY_INCOME',
    b: 'PaymentType.REFUND',
  },
  {
    concept: 'признак возврата',
    a: "description: 'Refund for failed generation'",
    b: 'type: PaymentType.REFUND',
  },
  {
    concept: 'списание',
    a: 'PaymentType.MONEY_OUTCOME',
    b: 'await processBalanceOperation({ paymentAmount })',
  },
]

/** Regex literals declared in a test file, with the name they are bound to. */
const REGEX_DECL =
  /(?:const|let)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=]+)?=\s*(\/(?:[^/\\\n]|\\.)+\/[gimsuy]*)/g

function selfCheck() {
  const fail = why => {
    console.error(`самопроверка не прошла: ${why}`)
    process.exit(2)
  }

  const sample = "const FOO = /return\\s+'x'/i\nconst BAR = 3\n"
  const found = [...sample.matchAll(REGEX_DECL)].map(m => m[1])
  if (found.length !== 1 || found[0] !== 'FOO')
    fail(`объявления регекспов разобраны неверно: ${JSON.stringify(found)}`)

  // A pair whose two spellings are identical would report every matcher as
  // symmetric and find nothing, which is indistinguishable from good news.
  for (const p of PAIRS)
    if (p.a === p.b) fail(`пара «${p.concept}» не различает написания`)

  console.log('самопроверка: объявления разобраны, пары различны')
}

selfCheck()

// Tracked AND present-but-unstaged. An index-only population makes a file
// invisible until `git add`, and the verdict below then describes a tree
// that is not the one on disk (it.176 closed this for the test-side
// guards; it.190 found it still open on the probe side).
const files = repoFiles(ROOT).filter(
  f => f.startsWith('src/__tests__/money/') && f.endsWith('.ts')
)

const asymmetric = []
let checked = 0

for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
  for (const decl of src.matchAll(REGEX_DECL)) {
    let re
    try {
      // Rebuild without the /g flag: lastIndex on a shared regex makes repeated
      // .test() alternate true/false, which would invent asymmetry.
      const body = decl[2].slice(0, decl[2].lastIndexOf('/'))
      const flags = decl[2].slice(decl[2].lastIndexOf('/') + 1).replace('g', '')
      re = new RegExp(body.slice(1), flags)
    } catch {
      continue
    }
    checked++
    for (const pair of PAIRS) {
      const seesA = re.test(pair.a)
      const seesB = re.test(pair.b)
      if (seesA !== seesB) {
        asymmetric.push({
          file: f,
          name: decl[1],
          concept: pair.concept,
          sees: seesA ? 'только A' : 'только B',
        })
      }
    }
  }
}

console.log(`матчеров проверено: ${checked}, пар: ${PAIRS.length}`)
console.log(
  `асимметричных (видят одно написание из двух): ${asymmetric.length}\n`
)

const byFile = new Map()
for (const r of asymmetric) {
  if (!byFile.has(r.file)) byFile.set(r.file, [])
  byFile.get(r.file).push(r)
}
for (const [file, rows] of byFile) {
  console.log(`  ${file}`)
  for (const r of rows)
    console.log(`      ${r.name}  «${r.concept}»  ${r.sees}`)
}

if (checked === 0) {
  console.error(
    '\nсамопроверка не прошла: НИ ОДНОГО матчера не разобрано -- сломан разбор.'
  )
  process.exit(2)
}
