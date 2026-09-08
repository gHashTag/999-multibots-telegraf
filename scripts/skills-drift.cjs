#!/usr/bin/env node
/**
 * DO THE SKILLS STILL DESCRIBE THIS REPOSITORY?
 *
 * Forty-one skills, 28 000 lines, written over months and never checked against
 * the tree they describe. A skill citing a file that moved sends the next
 * reader -- or the next agent -- to a path that does not exist, and it does so
 * with the authority of documentation.
 *
 * ── AN ADDRESS IS NOT A NAME, AND ONLY ADDRESSES CAN BREAK ────────────────
 *
 * In prose, `render/steps.ts` is a NAME: "render/steps.ts substitutes job_id".
 * Rewriting it to the full path would make the sentence worse and fix nothing.
 *
 * In a runnable block, `npx tsx scripts/check-infisical-keys.ts` is an ADDRESS.
 * If it is wrong the reader's command fails. Eighteen such addresses were found
 * broken across six files on the first run of this version.
 *
 * The two are reported separately, because they need different answers and
 * because mixing them buries the eighteen that matter under the ones that do not.
 *
 * ── WHAT THIS CHECKER GOT WRONG, IN ORDER ─────────────────────────────────
 *
 *   1. Resolved every path against the repository root -- 61% "missing", mostly
 *      false. Skills cite paths relative to a context they establish.
 *   2. Called a unique basename a move: claimed `src/sceneFactory/index.ts` had
 *      "moved to" an unrelated `index.ts`. A confident wrong pointer is worse
 *      than an honest "gone" -- the reader follows it.
 *   3. Kept that error even with the uniqueness rule: `atoms/chat.ts`, a deleted
 *      jotai atom, was said to have moved to an agent transport in another app,
 *      because `chat.ts` happened to be unique. The directories must agree too.
 *   4. Read only SKILL.md, though skills carry README, CHANGELOG and resources
 *      that cite paths just as confidently.
 *   5. Saw only backticked paths -- and so was blind to the ones inside runnable
 *      blocks, which are exactly the ones that cost the reader something.
 *
 * Every one of those was found by looking at what it claimed, never by reading
 * it. The battery at the bottom now holds each of them as a fixed case.
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const SKILLS = path.join(ROOT, '.claude', 'skills')

/**
 * Bases a skill may be writing relative to.
 *
 * Not a guess: each one appears in a real skill. Adding a base makes the check
 * WEAKER, so the list stays short and every entry has to earn its place.
 */
const BASES = [
  '.',
  'src',
  'apps/vibee-editor',
  'apps/vibee-editor/player',
  'apps/vibee-editor/player/src',
  'apps/vibee-editor/render',
  'apps/vibee-ios/Vibee',
]

/** Top-level directories of this repository: a path starting here is rooted. */
const ROOTED = /^(src|scripts|apps|packages|bin|docs|test|tests|\.claude)\//

const EXT = 'ts|tsx|js|mjs|cjs|yaml|yml|sh|swift|rs|zig|t27|json'
const QUOTED = new RegExp(
  '`([a-zA-Z0-9_][a-zA-Z0-9_./-]*\\.(?:' + EXT + '))`',
  'g'
)
const BARE = new RegExp(
  '(?:^|[\\s\'"(])([a-zA-Z0-9_.][a-zA-Z0-9_./-]*\\.(?:' +
    EXT +
    '))(?=$|[\\s\'")])',
  'g'
)

/**
 * Citations, tagged by whether the reader is expected to RUN them.
 *
 * A fenced bash block is the strongest form of address there is: its contents
 * are meant to be pasted into a shell. Those are collected without requiring
 * backticks, which is how eighteen broken commands stayed invisible.
 */
function citations(text) {
  const out = []
  const lines = text.split('\n')
  let fence = null
  for (const line of lines) {
    const open = /^\s*```+\s*(\w+)?/.exec(line)
    if (open) {
      fence = fence ? null : (open[1] || '').toLowerCase()
      continue
    }
    const shell = fence === 'bash' || fence === 'sh' || fence === 'shell'
    if (shell) {
      /*
       * A PATH INSIDE A SHELL FENCE IS NOT AUTOMATICALLY A COMMAND.
       *
       * code-quality-guardian lists naming examples in a bash fence:
       *
       *     # GOOD                         # BAD
       *     src/helpers/validation.ts      src/stuff/thing.ts
       *
       * `src/stuff/thing.ts` is invented ON PURPOSE, to show what a meaningless
       * name looks like. Reporting it as a broken address makes the checker
       * demand that an illustration be made real.
       *
       * A line is executed when something INVOKES the path -- a command word in
       * front of it, or the path invoking itself via ./ or / . A bare path
       * alone on a line is a listing.
       */
      if (/^\s*#/.test(line)) continue
      for (const m of line.matchAll(BARE)) {
        const ref = m[1]
        if (ref.includes('://')) continue
        const before = line
          .slice(0, m.index + (m[0].length - ref.length))
          .trim()
        const invoked = /^[.~/]/.test(ref) || before.length > 0
        if (invoked) out.push({ ref, runnable: true })
      }
      continue
    }
    if (fence !== null) continue // some other language: not our paths
    for (const m of line.matchAll(QUOTED))
      out.push({ ref: m[1], runnable: false })
  }
  return out
}

/** Where else in the tree does a file with this basename live? */
function findElsewhere(base) {
  try {
    const out = execFileSync('git', ['ls-files', '--', `*/${base}`, base], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

/**
 * A UNIQUE BASENAME IS NOT EVIDENCE OF A MOVE. THE DIRECTORIES MUST AGREE TOO.
 *
 * A suffix test is too strict: a real move often inserts a directory in the
 * middle (`scripts/check-infisical-keys.ts` -> `scripts/infisical/...`), which
 * no suffix of the candidate matches.
 *
 * What holds for every real move here and for none of the false ones: each
 * segment of the cited path appears in the candidate, IN ORDER.
 */
function segmentsInOrder(cited, candidate) {
  const want = cited.split('/').filter(Boolean)
  const have = candidate.split('/').filter(Boolean)
  let i = 0
  for (const seg of have) if (seg === want[i]) i++
  return i === want.length
}

function walkMd(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walkMd(p, acc)
    else if (e.name.endsWith('.md')) acc.push(p)
  }
  return acc
}

function main() {
  const rows = []
  let seen = 0

  for (const dir of fs.readdirSync(SKILLS).sort()) {
    const skill = path.join(SKILLS, dir)
    if (!fs.statSync(skill).isDirectory()) continue
    const bases = [...BASES.map(b => path.join(ROOT, b)), skill]

    for (const file of walkMd(skill, [])) {
      const text = fs.readFileSync(file, 'utf8')
      for (const { ref, runnable } of citations(text)) {
        // A bare filename is a mention, not a path: checking it would flag
        // every prose reference to a file the reader is expected to find.
        if (!ref.includes('/')) continue
        seen++
        if (bases.some(b => fs.existsSync(path.join(b, ref)))) continue

        const alt = findElsewhere(path.basename(ref)).filter(c =>
          segmentsInOrder(ref, c)
        )
        rows.push({
          skill: dir,
          where: path.relative(skill, file),
          ref,
          // An address is what the reader executes or resolves literally.
          address: runnable || ROOTED.test(ref),
          kind:
            alt.length === 1
              ? 'ПЕРЕЕХАЛ'
              : alt.length
                ? 'НЕОДНОЗНАЧНО'
                : 'УДАЛЁН',
          now: alt.length === 1 ? alt[0] : null,
          n: alt.length,
        })
      }
    }
  }

  const addr = rows.filter(r => r.address)
  const name = rows.filter(r => !r.address)

  console.log(`[скиллы] путей в описаниях : ${seen}`)
  console.log(
    `[скиллы] СЛОМАННЫХ АДРЕСОВ : ${addr.length}  (читатель выполнит и получит ошибку)`
  )
  console.log(
    `[скиллы] имён в прозе      : ${name.length}  (текст не сломан, править не надо)`
  )

  if (addr.length) {
    console.log('\n— адреса, которые не разрешаются —')
    for (const r of addr.slice(0, 25)) {
      // Built without nesting templates: the no-cyrillic guard does not
      // parse a template inside a template, and reads the inner string as a
      // comment. Restructuring is honest; silencing it with cyrillic-ok is not.
      const many = r.n ? ', ' + r.n + ' кандидатов' : ''
      const tail = r.now ? '\n   -> ' + r.now : '   (' + r.kind + many + ')'

      console.log(`  ${r.skill}/${r.where}\n      ${r.ref}${tail}`)
    }
  }
  if (name.length) {
    console.log('\n— имена в прозе: короткий путь тут намеренный —')
    const moved = name.filter(r => r.kind === 'ПЕРЕЕХАЛ')
    console.log(
      `  из них ${moved.length} имеют однозначный полный путь, ${name.length - moved.length} — нет`
    )
  }

  /*
   * Exit 0 on findings, deliberately.
   *
   * This is a REPORT, not a gate. Making stale documentation break the build
   * would mean the next person to touch an unrelated skill inherits somebody
   * else's rot, and the honest response to that is to delete the check.
   */
  if (!rows.length) console.log('\n✅ все упомянутые пути существуют')
}

/**
 * THE BATTERY: every mistake this checker has made, held as a fixed case.
 *
 * A rule tuned on an example and never re-run against it is an assumption.
 */
function selfTest() {
  let bad = 0
  const fail = m => {
    bad++
    console.log(`  ⛔ ${m}`)
  }

  const moves = [
    ['atoms/chat.ts', 'apps/vibee-editor/render/src/agent/chat.ts', false],
    ['x/index.ts', 'packages/vibee-atoms/src/index.ts', false],
    ['services/heygen/client.ts', 'src/core/neon/client.ts', false],
    [
      'scripts/check-infisical-keys.ts',
      'scripts/infisical/check-infisical-keys.ts',
      true,
    ],
    ['render/steps.ts', 'src/inngest_app/functions/render/steps.ts', true],
    ['config/access.config.ts', 'src/navigation/config/access.config.ts', true],
    ['src/sceneFactory/index.ts', 'src/scenes/sceneFactory/index.ts', true],
    [
      'helpers/renderSteps.ts',
      'src/inngest_app/functions/render/helpers/renderSteps.ts',
      true,
    ],
  ]
  for (const [cited, cand, want] of moves) {
    if (segmentsInOrder(cited, cand) !== want)
      fail(`переезд: ${cited} -> ${cand}: ждали ${want}`)
  }

  // The blind spot that hid eighteen broken commands: a path inside a bash
  // fence, with no backticks anywhere near it.
  const doc = [
    '```bash',
    'npx tsx scripts/check-infisical-keys.ts',
    '```',
    'prose mentions `render/steps.ts` by name',
    '```ts',
    'import x from "src/not-a-citation.ts"',
    '```',
  ].join('\n')
  const got = citations(doc)
  const run = got.filter(c => c.runnable).map(c => c.ref)
  const prose = got.filter(c => !c.runnable).map(c => c.ref)
  if (!run.includes('scripts/check-infisical-keys.ts'))
    fail('команда в bash-блоке не увидена — та самая слепота')
  if (!prose.includes('render/steps.ts')) fail('имя в прозе потеряно')
  if (got.some(c => c.ref === 'src/not-a-citation.ts'))
    fail('подобрано из ts-блока: это код, а не ссылка')

  // The illustration trap: a naming example in a shell fence is not a command.
  const listing = citations(
    ['```bash', '# BAD', 'src/stuff/thing.ts', './scripts/real.sh', '```'].join(
      '\n'
    )
  ).map(c => c.ref)
  if (listing.includes('src/stuff/thing.ts'))
    fail('перечень имён принят за команду — прибор требует овеществить пример')
  if (!listing.includes('./scripts/real.sh')) fail('вызов ./script потерян')

  if (!ROOTED.test('src/registerCommands.ts'))
    fail('укоренённый путь не опознан')
  if (ROOTED.test('render/steps.ts')) fail('имя в прозе принято за адрес')

  if (bad) {
    console.log(`\n[скиллы] ⚠️  ПРИБОР НЕ ГОДЕН: ${bad} провалов`)
    process.exit(1)
  }
  console.log(
    '[скиллы] прибор поверен: 8 переездов (3 заведомо ложных отвергнуты),'
  )
  console.log(
    '         команда в bash-блоке видна, код из ts-блока не подобран.'
  )
}

if (process.argv.includes('--self-test')) selfTest()
else main()
