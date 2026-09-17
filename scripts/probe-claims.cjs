#!/usr/bin/env node
/**
 * READ-ONLY. Messages that assert a fact -- and whether the code knows it.
 *
 * THE DEFECT CLASS. Three iterations in a row turned up the same thing: the bot
 * tells the person something other than what happened.
 *   "Funds refunded"            -- but the refund could have failed (PR #544)
 *   "You have no trained models" -- but training had hung for 13 months (#550)
 *   "Cost: 40 stars"            -- but the forty came from nowhere (#556)
 *
 * WHY THIS FILE WAS REWRITTEN. The first version asked a much weaker question:
 * "is there anything that LOOKS like a check within six lines above the reply".
 * Measured on 2026-09-17, that produced **14 money claims 'without a check
 * nearby', of which 14 were false** -- every one of them was either already
 * guarded or unreachable code:
 *
 *   ai-reels-wizard, videoTranscription, lipSync/index, hedra-render,
 *   ai-reels-render, adminCommands   -- the result IS tested, but the test sits
 *                                       more than six lines up, so the window
 *                                       never saw it;
 *   instagramParser (x4)             -- the claim is a `charged ? ... : ...`
 *                                       ternary INSIDE the message, which the
 *                                       old window did not read at all;
 *   generateImageToPrompt            -- `refund.success ? ... : ...`, same;
 *   fal-render (x2)                  -- after `return ctx.scene.leave()`, i.e.
 *                                       code that never runs;
 *   instagramParserScene             -- the failure branch, where nothing was
 *                                       charged, so the claim is true.
 *
 * A headline number that is 100% noise is worse than no number: the next pass
 * either spends an hour re-verifying it or learns to skip it, and then a real
 * finding in the same list goes unread. So the question is now the narrow one
 * that actually names the bug:
 *
 *   does a money write whose RESULT WAS DISCARDED (or bound and never tested)
 *   precede this claim?
 *
 * `updateUserBalance` and `directPaymentProcessor` do NOT throw on failure --
 * they return `false` / `{success:false}`. A discarded result is precisely the
 * case where "Funds refunded" can be a lie.
 *
 * REACHABILITY comes from the compiler, not from a guess: tsc with
 * `--allowUnreachableCode false` reports TS7027 and we drop claims that sit in
 * those regions. Without it the two dead fal-render sites come back as
 * "defects" forever. Pass --no-tsc to skip (about 19s) and the report says so.
 *
 * A denominator is mandatory: how many messages in total, how many assert a
 * fact, and how each of those is classified.
 *
 * SELF-CHECK is mandatory and covers every verdict this probe can return.
 *
 * Writes nothing.
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const USE_TSC = !process.argv.includes('--no-tsc')
const LOOKBACK = 60

/** Removes block comments, PRESERVING the line count. */
const strip = s =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m =>
      '\n'.repeat((m.match(/\n/g) || []).length)
    )
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

// The bots speak Russian to their users, so the claims this probe hunts for are
// written in Russian. Each pattern carries the guard's escape marker: without it
// the no-cyrillic guard would block the very file whose job is to read that text.
const CLAIMS = [
  ['refund claimed', /(возвращен|возврат сделан|refunded|refund complete)/i], // cyrillic-ok
  ['charge claimed', /(списано|списан[оы]|charged|deducted)/i], // cyrillic-ok
  ['credit claimed', /(начислен|зачислен|credited|added to your balance)/i], // cyrillic-ok
  [
    'outcome claimed',
    /(успешно|готово!|завершен|отправлен|complete[d]?!|success)/i, // cyrillic-ok
  ],
  [
    'duration claimed',
    /(займ[её]т|в течение|через \d+|takes? \d+|within \d+)/i, // cyrillic-ok
  ],
]

const MONEY_CLAIMS = new Set([
  'refund claimed',
  'charge claimed',
  'credit claimed',
])

/** Calls whose return value means "it worked / it did not". */
const MONEY_FNS = [
  'updateUserBalance',
  'directPaymentProcessor',
  'processBalanceOperation',
]
const MONEY_WRITE = new RegExp(`\\b(${MONEY_FNS.join('|')})\\s*\\(`)

const SPEAK =
  /(ctx\.reply|ctx\.replyWith|\.telegram\.sendMessage|editMessageText|sendMessageToUser)\s*\(/

/**
 * Line ranges the compiler says never run.
 *
 * tsc reports only the FIRST statement of an unreachable block, so the region
 * is extended forward while the indentation stays at or below the marker's --
 * that is the rest of the same block.
 */
function unreachableRegions() {
  let out
  try {
    out = execFileSync(
      'npx',
      ['tsc', '--noEmit', '--allowUnreachableCode', 'false'],
      {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      }
    )
  } catch (e) {
    // A non-zero exit is expected: TS7027 is reported as an error.
    out = String(e.stdout || '')
  }
  const byFile = {}
  // eslint-disable-next-line no-control-regex
  const clean = out.replace(/\[[0-9;]*m/g, '')
  for (const m of clean.matchAll(/^(\S+?):(\d+):(\d+) - error TS7027/gm)) {
    const file = m[1]
    const line = Number(m[2])
    const col = Number(m[3])
    ;(byFile[file] = byFile[file] || []).push({ line, indent: col - 1 })
  }
  // Extend each marker to the end of its block.
  const regions = {}
  for (const [file, marks] of Object.entries(byFile)) {
    let lines
    try {
      lines = fs.readFileSync(file, 'utf8').split('\n')
    } catch {
      continue
    }
    regions[file] = marks.map(({ line, indent }) => {
      let end = line
      for (let i = line; i < lines.length; i++) {
        const t = lines[i]
        if (!t.trim()) {
          end = i + 1
          continue
        }
        if (t.search(/\S/) < indent) break
        end = i + 1
      }
      return [line, end]
    })
  }
  return regions
}

/** `const ok = await fn(` / `const { success } = fn(` -> the bound name(s). */
function bindingOf(line) {
  const m = line.match(
    /\b(?:const|let|var)\s+(\{[^}]*\}|[\w$]+)\s*(?::[^=]+)?=\s*(?:await\s+)?/
  )
  if (!m) return null
  const raw = m[1]
  if (raw.startsWith('{')) {
    return raw
      .slice(1, -1)
      .split(',')
      .map(s => s.split(':').pop().trim())
      .filter(Boolean)
  }
  return [raw]
}

/**
 * Classifies one money claim.
 *
 *   discarded     a money write right above it threw its result away  <- defect
 *   unused        the result was bound to a name nobody ever tested   <- defect
 *   checked       the bound name is tested before or inside the message
 *   inline        the message itself branches on something (`x ? a : b`)
 *   no-write      no money write within LOOKBACK lines -- a different path,
 *                 not a claim about an operation performed right here
 */
function classify(lines, i, body) {
  // A claim that branches inside the message cannot assert the wrong thing:
  // both outcomes are spelled out.
  if (
    /\?[\s\S]*:/.test(body) &&
    /\b\w+\.success\b|\bcharged\b|\brefund(ed)?\b|\bpaymentSuccess\b|\bok\b/.test(
      body
    )
  ) {
    return { verdict: 'inline' }
  }

  for (let j = i - 1; j >= Math.max(0, i - LOOKBACK); j--) {
    const line = lines[j]
    if (!MONEY_WRITE.test(line)) continue
    if (/\b(function|export const .* =)\s/.test(line) && !/await/.test(line))
      continue

    const names = bindingOf(line)
    if (!names) {
      // `if (!(await updateUserBalance(...)))` consumes the result on the spot.
      if (
        /\b(if|while|return)\s*\(/.test(
          line.split(MONEY_FNS.find(f => line.includes(f)))[0]
        )
      )
        return { verdict: 'checked', at: j + 1 }
      return { verdict: 'discarded', at: j + 1 }
    }

    const between = lines.slice(j + 1, i).join('\n') + '\n' + body
    const tested = names.some(n =>
      new RegExp(
        `(if\\s*\\(\\s*!?\\s*${n}\\b|!${n}\\b|\\b${n}\\s*\\?|\\b${n}\\s*===|\\b${n}\\.success)`
      ).test(between)
    )
    return { verdict: tested ? 'checked' : 'unused', at: j + 1, names }
  }
  return { verdict: 'no-write' }
}

function scanText(text, file, regions) {
  const lines = text.split('\n')
  const out = []
  const dead = regions[file] || []
  for (let i = 0; i < lines.length; i++) {
    if (!SPEAK.test(lines[i])) continue
    let depth = 0
    let started = false
    const body = []
    for (let j = i; j < Math.min(i + 12, lines.length); j++) {
      body.push(lines[j])
      for (const ch of lines[j]) {
        if (ch === '(') {
          depth++
          started = true
        } else if (ch === ')') depth--
      }
      if (started && depth === 0) break
    }
    const msg = body.join('\n')
    for (const [kind, re] of CLAIMS) {
      if (!re.test(msg)) continue
      const lineNo = i + 1
      const isDead = dead.some(([a, b]) => lineNo >= a && lineNo <= b)
      const { verdict, at } = isDead
        ? { verdict: 'unreachable' }
        : classify(lines, i, msg)
      out.push({
        file,
        line: lineNo,
        kind,
        verdict,
        writeAt: at,
        text: (msg.match(new RegExp('.*(' + re.source + ').*', 'i')) || [''])[0]
          .trim()
          .slice(0, 72),
      })
      break
    }
  }
  return out
}

/**
 * Every verdict the probe can return has a fixture here. A probe whose own
 * logic is untested reports whatever its last regex happened to do.
 */
function selfCheck() {
  const cases = [
    [
      'discarded',
      `
      await updateUserBalance(id, cost, PaymentType.MONEY_OUTCOME, 'x')
      await ctx.reply('Списано: 40 звёзд')
      `,
    ],
    [
      'checked',
      `
      const paid = await updateUserBalance(id, cost, PaymentType.MONEY_OUTCOME, 'x')
      if (!paid) return
      await ctx.reply('Списано: 40 звёзд')
      `,
    ],
    [
      'unused',
      `
      const paid = await updateUserBalance(id, cost, PaymentType.MONEY_OUTCOME, 'x')
      const other = 1
      await ctx.reply('Списано: 40 звёзд')
      `,
    ],
    [
      'inline',
      `
      const charged = await updateUserBalance(id, cost, PaymentType.MONEY_OUTCOME, 'x')
      await ctx.reply(charged ? 'Списано: 40 звёзд' : 'Списание не прошло')
      `,
    ],
    [
      'no-write',
      `
      const t = await transcribe(url)
      await ctx.reply('Списано: 40 звёзд')
      `,
    ],
  ]
  const bad = []
  for (const [want, src] of cases) {
    const hits = scanText(strip(src), 'self', {})
    if (hits.length !== 1) {
      bad.push(`${want}: expected 1 claim, found ${hits.length}`)
      continue
    }
    if (hits[0].verdict !== want) bad.push(`${want}: got "${hits[0].verdict}"`)
  }
  // Negative control: a claim-free message must not be picked up at all.
  if (scanText(strip(`await ctx.reply('Выберите модель')`), 'self', {}).length)
    bad.push('a claim-free message was counted as a claim')

  if (bad.length) {
    console.error('SELF-CHECK FAILED:')
    for (const b of bad) console.error('  ' + b)
    process.exit(2)
  }
  console.log(
    `self-check passed: ${cases.length} verdicts + 1 negative control\n`
  )
}

function main() {
  selfCheck()

  const regions = USE_TSC ? unreachableRegions() : {}
  const deadCount = Object.values(regions).reduce((n, r) => n + r.length, 0)
  console.log(
    USE_TSC
      ? `reachability from tsc: ${deadCount} unreachable region(s)\n`
      : 'reachability: SKIPPED (--no-tsc) -- dead code will be reported as live\n'
  )

  const files = []
  ;(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (p.endsWith('.ts')) files.push(p)
    }
  })('src')

  let messages = 0
  const all = []
  for (const f of files) {
    if (f.includes('__tests__') || f.includes('/test/')) continue
    const text = strip(fs.readFileSync(f, 'utf8'))
    messages += (text.match(/ctx\.reply|sendMessage|editMessageText/g) || [])
      .length
    all.push(...scanText(text, f, regions))
  }

  console.log('=== Denominator ===')
  console.log(`  messages addressed to a person:  ${messages}`)
  console.log(`  of those asserting a fact:       ${all.length}`)

  const money = all.filter(h => MONEY_CLAIMS.has(h.kind))
  console.log(`  of those about money:            ${money.length}`)

  const tally = src => {
    const by = {}
    for (const h of src) by[h.verdict] = (by[h.verdict] || 0) + 1
    return by
  }

  console.log('\n=== Money claims by verdict ===')
  for (const [v, n] of Object.entries(tally(money)).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`  ${v.padEnd(12)} ${String(n).padStart(4)}`)
  }

  const defects = money.filter(
    h => h.verdict === 'discarded' || h.verdict === 'unused'
  )
  console.log(
    `\n=== LIVE money claims over an unverified result: ${defects.length} ===`
  )
  if (!defects.length) {
    console.log(
      '  none -- every money claim is guarded, inline-branched, or dead code.'
    )
  }
  for (const h of defects) {
    console.log(`  ${h.file}:${h.line}  (${h.verdict}, write at :${h.writeAt})`)
    console.log(`      ${h.text}`)
  }

  const dead = money.filter(h => h.verdict === 'unreachable')
  if (dead.length) {
    console.log(
      `\n=== In unreachable code (not a lie -- nobody sees it): ${dead.length} ===`
    )
    for (const h of dead) console.log(`  ${h.file}:${h.line}`)
  }

  console.log('\n=== Non-money claims by verdict (context only) ===')
  const rest = all.filter(h => !MONEY_CLAIMS.has(h.kind))
  for (const [v, n] of Object.entries(tally(rest)).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`  ${v.padEnd(12)} ${String(n).padStart(4)}`)
  }
}

main()
