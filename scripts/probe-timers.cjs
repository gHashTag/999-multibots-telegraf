#!/usr/bin/env node
'use strict'

/**
 * Timers whose callback is async, and what can go wrong with each.
 *
 * Two different hazards, and conflating them is why the first version of this
 * census was misleading:
 *
 *   RE-ENTRANCY -- only setInterval. It does not wait: a callback slower than
 *   its interval is started again alongside itself. For anything that reads a
 *   batch, acts, and marks afterwards, the second run redoes the first run's
 *   work. That is how the notification queue sent messages twice (#1803).
 *
 *   AN ESCAPING REJECTION -- any async timer. The process survives it, since
 *   setupGlobalErrorHandlers logs rather than exits, but the work is lost
 *   silently.
 *
 * Containment is NOT only `try {`. A callback whose body is a promise chain
 * ending in `.catch(...)` is contained just as well, and the first version of
 * this check counted only try -- so it reported four congratulatory messages in
 * morphingWizard as unguarded when every one of them ends in `.catch(() => {})`.
 * A matcher that knows one spelling of a thing reports the spelling, not the
 * thing.
 */

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const {
  blank,
  matchCode,
  selfCheck: blankSelfCheck,
} = require('./lib/blank-code.cjs')

const ROOT = path.resolve(__dirname, '..')

/** Body of the callback, by brace matching from the timer call. */
function callbackBody(source, at) {
  const open = source.indexOf('{', at)
  if (open < 0) return ''
  let depth = 0
  for (let j = open; j < source.length; j++) {
    if (source[j] === '{') depth++
    else if (source[j] === '}') {
      depth--
      if (!depth) return source.slice(open, j + 1)
    }
  }
  return source.slice(open)
}

const contains = body => /\btry\s*\{/.test(body) || /\.catch\s*\(/.test(body)
// Case-INSENSITIVE, and that is not pedantry: the guard in
// handleTextToVideoDirect is spelled `checkInFlight`, so a lowercase-only
// pattern reported a correctly guarded interval as unguarded. Third time in
// three iterations that a matcher of mine knew one spelling of a thing and
// reported the spelling rather than the thing.
const guarded = body =>
  /exclusiveTick|inFlight|isRunning|isProcessing|\brunning\b/i.test(body)

function selfCheck() {
  blankSelfCheck()
  const fail = why => {
    console.error(`самопроверка не прошла: ${why}`)
    process.exit(2)
  }
  const src = 'setInterval(async () => { await go() }, 1000)'
  const body = callbackBody(src, 0)
  if (!/await go\(\)/.test(body)) fail(`тело колбэка разобрано как ${body}`)
  if (contains(body)) fail('тело без обработки принято за защищённое')
  // Both spellings of containment, because counting only one is the mistake
  // this census was built to stop repeating.
  if (!contains('{ try { a() } catch (e) {} }'))
    fail('try не признан обработкой')
  if (!contains('{ a().catch(() => {}) }')) fail('.catch не признан обработкой')
  // Both spellings of the overlap guard, for the same reason.
  if (!guarded('{ if (checkInFlight) return }'))
    fail('checkInFlight не признан охраной')
  if (!guarded('{ if (inFlight) return }')) fail('inFlight не признан охраной')
  if (guarded('{ await go() }')) fail('обычное тело принято за охраняемое')
  console.log(
    'самопроверка: тела колбэков разобраны, обе формы обработки признаны'
  )
}

selfCheck()

const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter(
    f => f.startsWith('src/') && f.endsWith('.ts') && !f.includes('__tests__')
  )

const risky = []
const lossy = []
let total = 0
for (const f of files) {
  let raw
  try {
    raw = fs.readFileSync(path.join(ROOT, f), 'utf8')
  } catch {
    continue
  }
  for (const m of matchCode(raw, /set(Interval|Timeout)\s*\(\s*async/g)) {
    total++
    const body = blank(callbackBody(raw, m.index))
    const line = raw.slice(0, m.index).split('\n').length
    const where = `${f.replace('src/', '')}:${line}`
    if (m[1] === 'Interval' && !guarded(body)) risky.push(where)
    else if (!contains(body)) lossy.push(where)
  }
}

console.log(`\nтаймеров с async-колбэком: ${total}`)
console.log(`\n=== ПОВТОРЯЮЩИЙСЯ БЕЗ ОХРАНЫ ПЕРЕКРЫТИЯ: ${risky.length} ===`)
console.log(
  '   (setInterval не ждёт: медленный тик запускается рядом с собой)\n'
)
risky.sort().forEach(r => console.log(`  ${r}`))
console.log(`\n=== РАБОТА ТЕРЯЕТСЯ МОЛЧА: ${lossy.length} ===`)
console.log('   (ни try, ни .catch: процесс выживет, работа -- нет)\n')
lossy.sort().forEach(r => console.log(`  ${r}`))
