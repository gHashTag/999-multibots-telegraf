#!/usr/bin/env node
//
// postcommit — audit the #1397 post-commit-false-negative class across every
// payment-commit site, as HYPOTHESES for a human to read (never a gate).
//
// WHY. The #1397 class: a payment COMMITS (payments_v2 insert / updateUserBalance
// / setPayments succeeds), then a post-commit side-effect inside the SAME
// return-guarding try THROWS -> the outer catch flips the committed charge to
// false/null -> the caller retries into a double charge or fails to deliver.
// Fixed at directPayment.ts (#1400) and updateUserBalance.ts (#1398).
//
// The vitest ratchet cache-invalidation-isolated-ratchet.test.ts gates ONE
// trigger: invalidateBalanceCache must sit in its own try. But the class is
// broader -- getUserBalance was the OTHER post-commit throwable in directPayment,
// and getUserBalance is a plain reader called everywhere, so "every call
// isolated" is the wrong hard rule (false positives). Only the POST-COMMIT ones
// are risky, and that is not cleanly statically decidable. So this is a
// diagnostic, not a gate: it lists each commit site and any throwable primitive
// that appears AFTER the commit in the same file, and whether it looks isolated.
//
// Usage: node .claude/loop-opus/postcommit.mjs
// Exit is always 0 -- a flagged line is a HYPOTHESIS. Read it: a post-commit
// await that is wrapped in its own try/catch (log-and-continue) is SAFE; one
// inside the outer return-guarding try is the #1397 bug.
import fs from 'node:fs'
import path from 'node:path'

const walk = d =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name)
    if (e.isDirectory())
      return e.name === 'node_modules' ||
        e.name === '.git' ||
        e.name === '__tests__'
        ? []
        : walk(p)
    return e.isFile() && p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : []
  })

// A line that commits money (creates/moves a payments_v2 row).
const COMMIT =
  /from\(['"]payments_v2['"]\)|await updateUserBalance\s*\(|await setPayments\s*\(/
const INSERT = /\.insert\s*\(/
// Post-commit primitives that can THROW and, if inside the return-guarding try,
// flip a committed charge to a failure signal.
const THROWABLES = [
  ['invalidateBalanceCache', /await\s+invalidateBalanceCache\s*\(/],
  ['getUserBalance', /await\s+getUserBalance\s*\(/],
  ['ZodPaymentV2Schema.parse', /ZodPaymentV2Schema\.parse\s*\(/],
]

let sites = 0
let flags = 0
for (const f of walk('src')) {
  const src = fs.readFileSync(f, 'utf8')
  const lines = src.split('\n')
  // Find commit lines: a payments_v2 reference with an .insert within 8 lines,
  // OR a direct updateUserBalance/setPayments call.
  const commitLines = []
  for (let i = 0; i < lines.length; i++) {
    if (!COMMIT.test(lines[i])) continue
    if (/from\(['"]payments_v2['"]\)/.test(lines[i])) {
      // require an .insert nearby (a .select query is not a commit)
      const window = lines.slice(i, i + 9).join('\n')
      if (INSERT.test(window)) commitLines.push(i)
    } else {
      commitLines.push(i) // updateUserBalance / setPayments call
    }
  }
  if (!commitLines.length) continue
  const firstCommit = commitLines[0]
  // Flag throwable primitives that appear AFTER the first commit in this file.
  const post = []
  for (const [name, re] of THROWABLES) {
    for (let i = firstCommit + 1; i < lines.length; i++) {
      if (re.test(lines[i])) {
        // isolation hint: is the previous non-empty line an opening `try {`?
        let j = i - 1
        while (j >= 0 && lines[j].trim() === '') j--
        const isolated = j >= 0 && /try\s*\{\s*$/.test(lines[j].trim())
        // catch-block hint: a throwable in the outer catch is the ERROR path
        // (pre-commit-failure), not the post-commit-success window -- flagging
        // it as unisolated is a false alarm. Look back a few lines for `catch`.
        let inCatch = false
        for (let k = i - 1; k >= 0 && k >= i - 5; k--) {
          if (/\}?\s*catch\s*\(/.test(lines[k])) {
            inCatch = true
            break
          }
        }
        post.push({ name, line: i + 1, isolated, inCatch })
      }
    }
  }
  sites++
  const rel = f.replace(process.cwd() + '/', '')
  if (post.length) {
    console.log(`\n${rel}  (commit @ ${firstCommit + 1})`)
    for (const p of post) {
      const tag = p.isolated
        ? 'isolated ✓'
        : p.inCatch
          ? 'catch-block (error-path, not post-commit-success)'
          : 'CHECK: not in own try?'
      if (!p.isolated && !p.inCatch) flags++
      console.log(`   post-commit ${p.name} @ ${p.line}  [${tag}]`)
    }
  } else {
    console.log(
      `\n${rel}  (commit @ ${firstCommit + 1})  — no post-commit throwable`
    )
  }
}

console.log(
  `\n${sites} commit site(s); ${flags} post-commit throwable(s) that may not be isolated.`
)
console.log(
  'HYPOTHESES only. A post-commit await in its OWN try/catch is safe (#1397-clean).'
)
