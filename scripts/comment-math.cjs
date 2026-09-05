#!/usr/bin/env node
/**
 * EXECUTE THE ARITHMETIC A COMMENT DOES ON ITSELF.
 *
 * Some comments are not prose, they are calculations:
 *
 *   // Veo 3 Fast via Kie.ai: $0.40 per 8s = 40 stars
 *   // $0.03 -> 5 stars
 *   // 60 credits * $0.005 / $0.016 = 19 stars
 *
 * A comment of that shape quotes every figure it needs and then states the
 * answer, so checking it requires no knowledge of the domain, no database and
 * no runtime -- only doing the sum. In the iteration that started this, ten of
 * them were wrong across two files, and one of the ten was the number a live
 * charge is computed from.
 *
 * What counts as a claim here is deliberately narrow: an expression made only
 * of numbers and the four operators, followed by `=` and a number. Anything
 * with a name in it is prose about code, not a calculation, and guessing at
 * those is how a checker earns its reputation for noise.
 *
 * Rounding is not a mismatch. `2.8125 -> 3` is somebody rounding, and both
 * floor and ceiling appear deliberately in this repository, so a claim counts
 * as met if it equals the exact value or any of its three roundings. Only a
 * claim that matches NONE of them is reported. An `approximately` marker
 * widens that to five percent, because that is what the marker means.
 *
 * Usage:  node scripts/comment-math.cjs [pathFragment]
 *         node scripts/comment-math.cjs --self-check
 */

const fs = require('fs')
const path = require('path')
const { comments, selfCheck } = require('./lib/blank-code.cjs')
const { census } = require('./lib/read-census.cjs')

const ROOT = path.resolve(__dirname, '..')
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage'])

function sourceFiles(fragment) {
  const out = []
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(e.name)) continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(ts|tsx|js|cjs|mjs)$/.test(p)) out.push(p)
    }
  }
  walk(ROOT)
  return fragment ? out.filter(f => f.includes(fragment)) : out
}

/** `0,016` and `0.016` are the same number written by two people. */
const num = t => Number(String(t).replace(',', '.'))

/**
 * Evaluate a flat token list with the usual precedence.
 *
 * Written out rather than handed to eval or Function: the input is a comment
 * from the repository, and a checker that executes repository text as code is
 * a worse problem than the one it detects.
 */
function evaluate(tokens) {
  const vals = [num(tokens[0])]
  const ops = []
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i]
    const v = num(tokens[i + 1])
    if (op === '*' || op === '/') {
      const a = vals.pop()
      vals.push(op === '*' ? a * v : a / v)
    } else {
      ops.push(op)
      vals.push(v)
    }
  }
  let acc = vals[0]
  for (let i = 0; i < ops.length; i++) {
    acc = ops[i] === '+' ? acc + vals[i + 1] : acc - vals[i + 1]
  }
  return acc
}

const NUMBER = String.raw`\d+(?:[.,]\d+)?`
const OP = String.raw`[*×x/+\-]`
// One short word may follow an operand: `60 credits * $0.005` is arithmetic
// with a unit, not prose. Bounded to a single word of at most twelve letters
// so a sentence cannot masquerade as an expression.
const UNIT = String.raw`(?:\s*\p{L}{1,12}\.?)?`
// A number, then at least one operator-and-number, then = or -> and a number.
const CLAIM = new RegExp(
  String.raw`(-?)\$?\s*(${NUMBER})${UNIT}((?:\s*${OP}\s*\$?\s*${NUMBER}${UNIT})+)\s*(?:==|~=|=|→|->|≈|~)\s*(-?)\$?\s*(${NUMBER})`,
  'gu'
)

/**
 * Claims found in one comment, already evaluated.
 *
 * A match whose first operand is preceded by a word or digit is a FRAGMENT,
 * not a claim: in `60 credits * 0.005 / 0.016 ~= 19` the regex can only start
 * at 0.005, because `credits` sits between the 60 and the operator. Evaluating
 * that fragment gives 0.3125 against a claimed 19 and reports a defect in a
 * comment that is perfectly correct.
 *
 * Fragments are counted and reported as unjudged rather than guessed at. The
 * alternative -- teaching the matcher which words are units -- makes the
 * checker's verdict depend on a vocabulary nobody maintains.
 */
function claimsIn(text) {
  const found = []
  let fragments = 0
  const fragmentTexts = []
  for (const m of text.matchAll(CLAIM)) {
    // A fragment is a TRUNCATED chain, not merely an expression with prose in
    // front of it. Almost every claim has words before it, and the first
    // version rejected them all -- sixteen expressions went unjudged, most of
    // them perfectly parseable, including `5+6+5+5=21`.
    //
    // What truncation actually looks like is `60 credits * 0.005`: an operator
    // the regex could not use, a unit word, and a NUMBER behind it. So strip
    // the trailing operator, then at most one word, and ask whether a digit is
    // left. Prose ending in a word is not truncation; prose ending in a
    // number is.
    // One combined class, applied once. Stripping operators and then words in
    // two passes leaves `$0.10/sec x` as `$0.10/`, which ends in a slash and
    // so escapes the digit test -- four correct comments were reported as
    // defects that way. And it must be a flat class, not `(?:\s*\p{L}+)+$`:
    // that nested quantifier is the textbook catastrophic-backtracking shape
    // and hung the census on the first long comment it met.
    const before = text.slice(0, m.index).replace(/[\s$*×/+\-\p{L}]+$/u, '')
    if (/\p{N}$/u.test(before)) {
      fragments++
      fragmentTexts.push(m[0].trim())
      continue
    }
    // A leading minus belongs to the NUMBER, not to the expression. Without
    // this, `-9511.56 + 20000 = 10488.44` -- which is correct -- was read as
    // 9511.56 + 20000 and reported as a defect in somebody's balance note.
    const tokens = [m[1] + m[2]]
    for (const t of m[3].matchAll(
      new RegExp(String.raw`(${OP})\s*\$?\s*(${NUMBER})`, 'gu')
    )) {
      tokens.push(t[1] === '×' || t[1] === 'x' ? '*' : t[1], t[2])
    }
    const value = evaluate(tokens)
    if (!Number.isFinite(value)) continue
    // `1 + 1.5 = 150% markup` states a ratio as a percentage. The operands are
    // not percentages, so the two sides are in different units and comparing
    // them reports a defect in a comment that is explaining one.
    // Only a percent sign is treated as a units mismatch. A WORD after the
    // answer is not: `= 10488.44 stars` and `= 40 stars` are exactly the
    // shapes this tool exists to check, and a rule broad enough to skip
    // `= 1 hour` skips those too. The handful of genuine unit conversions are
    // named in the ratchet instead of guessed at here.
    if (text.slice(m.index + m[0].length).startsWith('%')) {
      fragments++
      fragmentTexts.push(`${m[0].trim()}%  (проценты против долей)`)
      continue
    }
    const claimed = num(m[4] + m[5])
    const approx = /≈|~/.test(m[0])
    // Compare at the precision the claim is WRITTEN to. "2.8" for 2.8125 is a
    // correct statement to one decimal, and reading it as a claim of exactly
    // 2.8 turns every honestly rounded figure into a defect. The first version
    // did exactly that and failed on its own fixture.
    const decimals = (m[5].split(/[.,]/)[1] || '').length
    const p = Math.pow(10, decimals)
    const ok = approx
      ? Math.abs(value - claimed) <= Math.max(0.05 * Math.abs(value), 1)
      : [
          Math.round(value * p) / p,
          Math.floor(value * p) / p,
          Math.ceil(value * p) / p,
        ].some(v => Math.abs(v - claimed) < 1e-9)
    found.push({ expr: m[0].trim(), value, claimed, ok, approx })
  }
  found.fragments = fragments
  found.fragmentTexts = fragmentTexts
  return found
}

function selfCheckMe() {
  selfCheck(null)
  const cases = [
    // [comment text, how many claims, how many wrong]
    ['// Veo 3 Fast via Kie.ai: $0.40 / $0.016 = 40', 1, 1],
    ['// Kie.ai 2025: $0.40 / $0.016 = 25 (no markup)', 1, 0],
    // The real line from unified-video-models.config.ts, not a paraphrase of
    // it: the repository writes approximation with the symbol, and a fixture
    // that spells it as a word exercises a shape that does not exist while
    // colliding with the units rule below.
    ['// $0.03 × 1.5 / $0.016 = 2.8⭐ ≈ 3⭐', 1, 0],
    // One unit word between an operand and its operator is arithmetic with a
    // unit, and is parsed: 60 * 0.005 / 0.016 = 18.75, stated as ~19.
    ['// 60 credits * 0.005 / 0.016 ~= 19', 1, 0],
    // Several words is prose, and the chain really is truncated: the matcher
    // can only start at 0.005 and would call a correct comment wrong. Counted,
    // never judged.
    ['// 60 units of credit * 0.005 / 0.016 ~= 19', 0, 0],
    // A percentage against plain ratios is a units mismatch, not a defect.
    // This line exists in the repository, explaining an old bug.
    [
      '// use as multiplier (1.5 = 50%), not addition (was 1 + 1.5 = 150% markup)',
      0,
      0,
    ],
    ['// just prose about the code, no numbers at all', 0, 0],
    ['// bumped the retry limit to 5', 0, 0],
  ]
  for (const [text, wantCount, wantWrong] of cases) {
    const got = claimsIn(text)
    const wrong = got.filter(c => !c.ok).length
    if (got.length !== wantCount || wrong !== wantWrong) {
      console.error(
        `self-check FAILED on ${JSON.stringify(text)}: ` +
          `got ${got.length} claims / ${wrong} wrong, wanted ${wantCount} / ${wantWrong}`
      )
      process.exit(2)
    }
  }
  // Rounding in both directions must be accepted, or every deliberate floor in
  // the repository is reported as a defect and the output becomes unreadable.
  if (claimsIn('// 0.15 * 1.5 / 0.016 = 14')[0].ok !== true) {
    console.error('self-check FAILED: a floored claim was rejected')
    process.exit(2)
  }
  // A leading minus is part of the number. This exact line exists in the
  // repository and was reported as a defect by the first version.
  {
    const got = claimsIn('// new balance: -9511.56 + 20000 = 10488.44 stars')
    if (got.length !== 1 || !got[0].ok) {
      console.error(
        'self-check FAILED: a negative first operand was mishandled'
      )
      process.exit(2)
    }
  }
  // The fragment case must be SEEN, not merely absent: a matcher that found
  // nothing at all would also pass the case above.
  if (claimsIn('// 60 units of credit * 0.005 / 0.016 ~= 19').fragments !== 1) {
    console.error('self-check FAILED: the fragment was not even noticed')
    process.exit(2)
  }
  console.log(
    'self-check OK: a wrong sum is caught, a rounded one is not, a fragment is counted'
  )
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--self-check')) return selfCheckMe()
  selfCheck(null)

  const files = sourceFiles(argv.find(a => !a.startsWith('--')))
  const c = census('comment-math')
  let claims = 0
  let fragments = 0
  const fragmentList = []
  const wrong = []
  for (const f of files) {
    const raw = c.read1(f)
    if (raw === null) continue
    for (const cm of comments(raw)) {
      const found = claimsIn(cm.text)
      fragments += found.fragments
      for (const t of found.fragmentTexts) {
        fragmentList.push(
          `${path.relative(ROOT, f)}:${raw.slice(0, cm.start).split('\n').length}  ${t}`
        )
      }
      for (const claim of found) {
        claims++
        if (claim.ok) continue
        const line = raw.slice(0, cm.start).split('\n').length
        wrong.push({ file: path.relative(ROOT, f), line, ...claim })
      }
    }
  }
  c.report(files.length)

  console.log(`\nарифметических утверждений в комментариях: ${claims}`)
  console.log(`не сходится: ${wrong.length}`)
  console.log(
    `не разобрано (слово между операндами): ${fragments} — про них ничего не сказано`
  )
  if (claims === 0) {
    console.log('НОЛЬ утверждений — это не чистота, а сломанный матчер')
    process.exit(2)
  }
  for (const w of wrong) {
    console.log(`\n  ${w.file}:${w.line}`)
    console.log(`    ${w.expr}`)
    console.log(`    считается ${w.value}, заявлено ${w.claimed}`)
  }
  if (argv.includes('--fragments')) {
    console.log('\nне разобрано:')
    for (const f of fragmentList) console.log(`  ${f}`)
  }
}

main()
