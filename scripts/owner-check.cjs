#!/usr/bin/env node
/**
 * The owner-queue claims that can be checked WITHOUT the database.
 *
 * it.193: the queue contradicted itself -- its summary table said the
 * stuck-training watchdog was connected while the detailed item still asked
 * for that decision -- and the whole block was dated FIVE DAYS AHEAD, so an
 * honestly dated recheck would have looked older than it.
 *
 * CAREFUL WITH THE RECOUNT. A naive count of Inngest keys gives one extra
 * prod key: it belongs to a self-check fixture (signkey-prod-deadbeef...,
 * marked secret-guard-ok). Reporting it would announce a leak that does not
 * exist, so such lines are excluded explicitly.
 *
 * WHAT THIS CANNOT KNOW: everything living in the DATABASE -- balances,
 * payments, model links. Without production credentials those numbers are not
 * checked at all, and silence here does not mean they are still true.
 */

const fs = require('fs')
const { repoFiles } = require('./lib/repo-sources.cjs')
const SIGN = /signkey-(prod|test)-[a-f0-9]{64}/g
let occ = 0,
  prod = 0,
  fixtures = 0
const files = new Set()
const ROOT = require('path').resolve(__dirname, '..')
process.chdir(ROOT)
for (const f of repoFiles('.')) {
  if (!fs.existsSync(f)) continue
  let st
  try {
    st = fs.statSync(f)
  } catch {
    continue
  }
  if (!st.isFile() || st.size > 4e6) continue
  let raw
  try {
    raw = fs.readFileSync(f, 'utf8')
  } catch {
    continue
  }
  for (const m of raw.matchAll(SIGN)) {
    const head = raw.slice(0, m.index).split('\n').pop()
    const tail = raw.slice(m.index).split('\n')[0]
    if (/secret-guard-ok|self-check sample|invented/.test(head + tail)) {
      fixtures++
      continue
    }
    occ++
    files.add(f)
    if (m[1] === 'prod') prod++
  }
}
console.log(
  '20. Inngest keys: ' +
    occ +
    ' occurrences, ' +
    files.size +
    ' files, ' +
    prod +
    ' prod'
)
console.log(
  '    claimed 17 / 14 / 6; self-check fixtures excluded: ' + fixtures
)
const scraper = 'src/inngest_app/functions/instagram/instagramScraper-v2.ts'
let neon = false
if (fs.existsSync(scraper)) {
  const raw = fs.readFileSync(scraper, 'utf8')
  neon = /NEON_DATABASE_URL/.test(raw) && /postgres:\/\//.test(raw)
}
console.log(
  '19. Neon URL fallback in code: ' +
    (neon ? 'STILL THERE' : 'removed, as claimed')
)
const reg = fs.readFileSync('src/inngest_app/registerFunctions.ts', 'utf8')
console.log(
  '4.  checkStuckTrainings registered: ' +
    (/^\s*checkStuckTrainings,/m.test(reg) ? 'yes (item resolved)' : 'NO')
)
const rew = fs.readFileSync('src/core/referral/rewardInviter.ts', 'utf8')
console.log(
  '5.  referral reward fails closed at 0: ' +
    (/REFERRAL_BONUS_STARS\s*<=\s*0/.test(rew)
      ? 'yes (still owner decision)'
      : 'CHANGED')
)
