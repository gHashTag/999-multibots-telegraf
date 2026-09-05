#!/usr/bin/env node
/**
 * EVERY SWITCHED-OFF TEST, AND WHETHER IT SAYS WHY.
 *
 * A skipped test is not a failing one, but it is not coverage either. It is a
 * guard standing where a working guard would go, and the only thing separating
 * "deliberately parked" from "quietly abandoned" is a stated reason.
 *
 * The two kinds are not the same question:
 *
 *   .skipIf(cond)  CONDITIONAL. Self-documenting: the condition IS the reason
 *                  (no credentials, wrong platform). Counted, not judged.
 *   .skip(...)     UNCONDITIONAL. Someone switched this off and it stays off
 *                  until a person decides otherwise. This one owes an
 *                  explanation.
 *
 * The good example already in the tree: nine Inngest files each disable
 * themselves with a paragraph naming the exact mismatch (render.ts exports
 * renderFunction, the test imports render) and the decision that would revive
 * them. That is a park, not an abandonment, and it reads as one.
 *
 * HOW THE REASON IS FOUND, and why it is not a line window: the text examined
 * is everything between the END OF THE PREVIOUS STATEMENT and the skip itself.
 * That span is whatever the author wrote directly above this test and nothing
 * else -- no N to tune, and no risk of borrowing a comment that belongs to a
 * neighbour twenty lines up. See vibee-stack-hard-won 203 and 207.
 */

const fs = require('fs')
const { repoFiles } = require('./lib/repo-sources.cjs')
const path = require('path')
const { execFileSync } = require('child_process')
const { blank } = require('./lib/blank-code.cjs')

const ROOT = path.resolve(__dirname, '..')

const UNCONDITIONAL = /(?<![\w$.])(?:describe|it|test)\.skip\s*\(/g
const CONDITIONAL = /(?<![\w$.])(?:describe|it|test)\.skipIf\s*\(/g

/**
 * The raw text between the previous piece of CODE and `at`.
 *
 * Found on the mask, where comments and string literals are blank, so the last
 * non-space character before the anchor is by construction real code. What lies
 * between them in the SOURCE is exactly the comment block that introduces this
 * statement, if there is one.
 */
function gapBefore(raw, mask, at) {
  let i = at - 1
  while (i >= 0 && /\s/.test(mask[i])) i--
  return raw.slice(i + 1, at)
}

/**
 * A comment above the skip, with enough substance to be a reason rather than a
 * token like "todo".
 *
 * The letter count uses \p{L} with /u, NOT \W. In JavaScript \W is ASCII-only,
 * so a Cyrillic sentence strips to LENGTH ZERO -- the first version of this
 * check reported a fully explained skip as bare, in a repository whose comments
 * are largely Russian. Same family as the "yo is outside the a-ya range" bug in the
 * skill: a character class that quietly does not know the alphabet in use.
 */
const hasReason = gap =>
  /\/\/|\/\*|\*/.test(gap) && (gap.match(/[\p{L}\p{N}]/gu) || []).length > 12

function scan(raw) {
  const mask = blank(raw)
  const out = { conditional: 0, unconditional: [] }
  for (const m of mask.matchAll(CONDITIONAL)) out.conditional++
  for (const m of mask.matchAll(UNCONDITIONAL)) {
    const line = raw.slice(0, m.index).split('\n').length
    const gap = gapBefore(raw, mask, m.index)
    out.unconditional.push({ line, explained: hasReason(gap) })
  }
  return out
}

const SAMPLES = [
  {
    why: 'a bare skip with nothing above it is unexplained',
    code: `const a = 1\ndescribe.skip('x', () => {})`,
    unconditional: 1,
    explained: 0,
  },
  {
    why: 'a paragraph directly above is the reason',
    code: `const a = 1\n// The imports name functions that do not exist yet, so this\n// would be red forever. Unpark when the shape is decided.\ndescribe.skip('x', () => {})`,
    unconditional: 1,
    explained: 1,
  },
  {
    why: 'a comment belonging to an EARLIER statement is not borrowed',
    code: `// this explains the constant below and nothing else at all\nconst a = 1\ndescribe.skip('x', () => {})`,
    unconditional: 1,
    explained: 0,
  },
  {
    why: 'a token comment is not a reason',
    code: `const a = 1\n// todo\ndescribe.skip('x', () => {})`,
    unconditional: 1,
    explained: 0,
  },
  {
    // The sample that catches \W: this is a real reason, and an ASCII-only
    // letter class scores it zero.
    why: 'a reason written in Cyrillic counts as a reason',
    code: `const a = 1\n// Часть проверок здесь обращается к несуществующим функциям.\ndescribe.skip('x', () => {})`,
    unconditional: 1,
    explained: 1,
  },
  {
    why: 'skipIf is conditional, and never counted as unconditional',
    code: `describe.skipIf(!process.env.KEY)('x', () => {})`,
    unconditional: 0,
    conditional: 1,
  },
  {
    why: 'the word skip inside a string or a longer name is not a skip',
    code: `const s = 'describe.skip('\nmyDescribe.skipThing()`,
    unconditional: 0,
  },
]

function selfCheck() {
  for (const s of SAMPLES) {
    const r = scan(s.code)
    if (r.unconditional.length !== s.unconditional)
      throw new Error(
        `skip count wrong (${s.why}): expected ${s.unconditional}, got ${r.unconditional.length}`
      )
    if (s.conditional !== undefined && r.conditional !== s.conditional)
      throw new Error(`conditional count wrong (${s.why})`)
    if (s.explained !== undefined) {
      const n = r.unconditional.filter(u => u.explained).length
      if (n !== s.explained)
        throw new Error(
          `reason detection wrong (${s.why}): expected ${s.explained}, got ${n}`
        )
    }
  }
  return true
}

function testFiles() {
  // A switched-off test is switched off whether or not it is staged. With the
  // index-only population an untracked skipped test was invisible: the
  // mutation that proved it survived until the file was `git add`ed.
  return repoFiles(ROOT).filter(f => /\.test\.ts$/.test(f))
}

function census() {
  const rows = []
  let conditional = 0
  for (const f of testFiles()) {
    const r = scan(fs.readFileSync(path.join(ROOT, f), 'utf8'))
    conditional += r.conditional
    if (r.unconditional.length) rows.push({ file: f, skips: r.unconditional })
  }
  return { rows, conditional }
}

function main() {
  selfCheck()
  console.log(`самопроверка: ${SAMPLES.length} образцов сошлись`)

  const { rows, conditional } = census()
  const all = rows.flatMap(r => r.skips)
  const bare = rows
    .map(r => ({ file: r.file, skips: r.skips.filter(s => !s.explained) }))
    .filter(r => r.skips.length)

  console.log(
    `\nусловных .skipIf(  : ${conditional}  -- условие и есть причина, не судим`
  )
  console.log(`безусловных .skip( : ${all.length} в ${rows.length} файлах`)
  console.log(`  с объяснением    : ${all.filter(s => s.explained).length}`)
  console.log(
    `  БЕЗ объяснения   : ${all.filter(s => !s.explained).length} в ${bare.length} файлах\n`
  )

  for (const r of bare)
    console.log(`  ${r.file}:${r.skips.map(s => s.line).join(',')}`)

  console.log(
    '\nбезусловный пропуск без причины неотличим от заброшенного: следующий' +
      '\nчитатель не может решить, снимать его или удалять тест целиком.'
  )
}

if (require.main === module) main()
module.exports = { scan, census, selfCheck, SAMPLES }
