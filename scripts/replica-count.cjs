#!/usr/bin/env node
/**
 * HOW MANY PROCESSES ARE ACTUALLY RUNNING, WHICH IS WHAT THE MONEY GUARDS REST ON.
 *
 * `docs/money-invariants` calls this the most fragile point of the whole map,
 * and it is right. Three separate mechanisms stop a double charge -- the scenes'
 * in-flight flags (18 places), Inngest `step.run`, and the consume-once marks --
 * and ALL THREE are per-process. They hold because the bot runs as exactly one
 * replica. Raise that number and every one of them silently stops working: two
 * processes have two sets of module-level flags, and a double tap lands one in
 * each.
 *
 * Until now the guard for it was `guardsAssumeOneProcess.test.ts`, which reads
 * `railway.toml` and asserts the FILE says one. That is the declared number.
 * The effective one lives in the deployment Railway actually ran, and Railway's
 * own UI can set it -- the same class of gap that let the mini app read the
 * bot's config for nine days while the repository looked correct.
 *
 * The deployment record carries it: `meta.serviceManifest.deploy.numReplicas`,
 * plus `multiRegionConfig`, where each region has its own count. A service in
 * two regions with one replica each is TWO processes, and the money guards
 * cannot tell the difference.
 *
 *   node scripts/replica-count.cjs [service ...]
 *
 * Read-only. Exit: 0 one process where one is required, 1 more than one, 2
 * Railway could not be read (never a green answer from no data).
 */
'use strict'

const { execSync } = require('node:child_process')

const PAINT = Boolean(process.stdout.isTTY)
const ESC = PAINT ? String.fromCharCode(27) : ''
const wrap = (code, s) => (PAINT ? `${ESC}[${code}m${s}${ESC}[0m` : s)
const dim = s => wrap(2, s)
const red = s => wrap(31, s)
const green = s => wrap(32, s)
const bold = s => wrap(1, s)

/**
 * The service whose money guards depend on this. The render and the mini app
 * are listed for the picture, but only the bot's count is a verdict: the
 * in-flight flags, the consume-once marks and the scenes all live here.
 */
const MUST_BE_ONE = '999-multibots-telegraf'
const SERVICES = [MUST_BE_ONE, 'vibee-render', 'vibee-editor']

/**
 * HOW MANY PROCESSES A MANIFEST DESCRIBES, AS A PURE FUNCTION.
 *
 * Multi-region is the trap: `numReplicas: 1` beside `multiRegionConfig: {sfo:
 * {numReplicas: 1}, ams: {numReplicas: 1}}` is two processes, and reading only
 * the top-level number would call that one.
 */
function processCount(manifest) {
  const deploy = manifest?.deploy
  if (!deploy) return null
  const regions = deploy.multiRegionConfig
  if (regions && typeof regions === 'object') {
    const counts = Object.values(regions)
      .map(r => Number(r?.numReplicas))
      .filter(n => Number.isFinite(n))
    if (counts.length) return counts.reduce((a, b) => a + b, 0)
  }
  const flat = Number(deploy.numReplicas)
  return Number.isFinite(flat) ? flat : null
}

function newestManifest(service) {
  const out = execSync(
    `railway service ${JSON.stringify(service)} >/dev/null 2>&1; railway deployment list --json 2>/dev/null`,
    { encoding: 'utf8', shell: '/bin/sh', maxBuffer: 64 * 1024 * 1024 }
  )
  const list = JSON.parse(out)
  const withManifest = list.find(d => d?.meta?.serviceManifest)
  return withManifest
    ? {
        manifest: withManifest.meta.serviceManifest,
        at: withManifest.createdAt,
      }
    : null
}

function main() {
  const asked = process.argv.slice(2).filter(a => !a.startsWith('-'))
  const services = asked.length ? asked : SERVICES

  console.log(bold('how many processes are running'))
  console.log(
    dim(
      '  the money guards are per-process: in-flight flags, step.run, consume-once.' +
        ` More than one ${MUST_BE_ONE} means none of them hold.`
    )
  )
  console.log()

  let readAny = false
  let bad = 0

  for (const service of services) {
    let found
    try {
      found = newestManifest(service)
    } catch (e) {
      console.log(
        `  ${service}: ${red('could not read Railway')} ${dim(e.message.slice(0, 60))}`
      )
      continue
    }
    if (!found) {
      console.log(`  ${service}: ${red('no deployment carries a manifest')}`)
      continue
    }
    readAny = true
    const n = processCount(found.manifest)
    const regions = found.manifest.deploy?.multiRegionConfig
    const where = regions ? ` in ${Object.keys(regions).join(', ')}` : ''
    const verdict =
      service === MUST_BE_ONE
        ? n === 1
          ? green('one process')
          : red(`${n} processes -- the money guards do not hold`)
        : dim(`${n}`)
    if (service === MUST_BE_ONE && n !== 1) bad++
    console.log(
      `  ${service.padEnd(24)} ${verdict}${dim(where)}  ${dim(`as of ${found.at}`)}`
    )
  }

  /*
   * NO DATA IS NOT GOOD NEWS. Without Railway this tool knows nothing, and a
   * silent exit 0 would read as "one replica, all is well".
   */
  if (!readAny) {
    console.error(
      '\nnothing could be read -- this says nothing about production'
    )
    process.exitCode = 2
    return
  }
  if (bad) process.exitCode = 1
}

module.exports = { processCount, MUST_BE_ONE }

if (require.main === module) main()
