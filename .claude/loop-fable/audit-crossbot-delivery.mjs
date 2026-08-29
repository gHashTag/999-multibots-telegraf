#!/usr/bin/env node
// loop-fable: regression guard for the "singleton cross-bot misdelivery" class.
// 999-multibots runs MANY bots in ONE process. A SINGLETON module (getInstance /
// private static instance) that holds one mutable this.bot, set by a setter on
// EVERY bot's startup (last-writer-wins), and then delivers the per-user RESULT
// through this.bot.telegram.send*, will route a job to the wrong bot: wrong
// sender, or a failed send. The class was closed in #1150 (async-lipsync-manager
// now resolves the per-job bot via getBotByNameAdapter(job.botInfo.username)).
//
// Finding signature = SINGLETON AND calls this.bot.telegram.send*. A correct
// singleton delivers through the RESOLVED per-job bot (`bot.telegram.send`), not
// the shared this.bot. Non-singletons (per-bot constructor: notificationHandler,
// telegram-log.service) are excluded — their this.bot is bound to one bot.
//
// Run: node .claude/loop-fable/audit-crossbot-delivery.mjs
// Exit: 1 - a singleton delivers through the shared this.bot (regression);
//       2 - could not scan src; 0 - clean. Mutates nothing.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = 'src'
if (!fs.existsSync(ROOT)) {
  console.error('missing dir', ROOT)
  process.exit(2)
}

const walk = d =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(p)
    return e.isFile() && p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : []
  })

const SINGLETON = /getInstance\s*\(|private static instance\b/
const DELIVERS = /this\.bot\.telegram\.send/

const findings = []
for (const f of walk(ROOT)) {
  const src = fs.readFileSync(f, 'utf8')
  if (SINGLETON.test(src) && DELIVERS.test(src)) {
    const n = (src.match(/this\.bot\.telegram\.send/g) || []).length
    findings.push({ f, n })
  }
}

if (findings.length === 0) {
  console.log(
    'OK crossbot: no singleton delivers per-user via the shared this.bot'
  )
  process.exit(0)
}
console.error(
  'FOUND: a singleton delivers via the shared this.bot (cross-bot misdelivery)'
)
for (const { f, n } of findings) {
  console.error(`  ${f}  (${n}x this.bot.telegram.send)`)
  console.error(
    '    -> resolve the per-job bot: getBotByNameAdapter(job.botInfo?.username).bot'
  )
}
console.error(
  'Class and fix pattern: memory multibots-singleton-crossbot; precedent #1150.'
)
process.exit(1)
