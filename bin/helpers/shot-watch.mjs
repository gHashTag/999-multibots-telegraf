#!/usr/bin/env node
/**
 * tri shot watch [--state FILE] [--from FILE]
 *
 * The phone shots on a clock, compared with the last run instead of read
 * alone. `tri shot all` answers "is every stand green now"; nobody runs it
 * between PRs, so a stand that went red on main because somebody else's
 * change moved a button stays red until the next person who happens to look.
 * This runs `all`, keeps one verdict per stand (harness x width x language)
 * in ~/.cache/tri/shot-watch.json, and says what CHANGED since then:
 *
 *   worse   green -> RED, anything -> NOT MEASURED, more problems than
 *           before, a new stand that is not green, a stand that vanished
 *           (a stand dropping out of `all` is how a measurement rots
 *           unseen -- see the phone-shot skill);
 *   better  the reverse;
 *   same    printed as one count line, not stand by stand.
 *
 * Exit 0 nothing got worse, 1 something did, 2 nothing could be measured.
 * A run that measured nothing does NOT overwrite the state: "the dev server
 * did not start" must not become the new normal the next run compares to.
 * Nothing is sent anywhere; whoever schedules it reads the exit code.
 *
 * --from FILE parses saved `tri shot all` output instead of running it.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const RANK = { green: 0, RED: 1, 'NOT MEASURED': 2 }
const ISSUE = /^\s+(small|cut|overlap|order|error)\s+(.*)$/
const VERDICT =
  /^== shot (green|RED|NOT MEASURED) -- (\S+) at (\d+)px \((ru|en)\)/
// `all` prints this shape when a child printed no verdict at all.
const SILENT = /^== shot NOT MEASURED -- (\S+) (\d+) (ru|en)\s*$/
const ALL_DOWN = /^== shot NOT MEASURED -- all: /

/** @typedef {{ verdict: string, issues: string[] }} Stand */

/**
 * One entry per stand, keyed "name width lang". A stand's problem lines are
 * printed before its verdict line, so they are collected until the verdict
 * that closes them.
 * @param {string} text
 * @returns {{ runs: Record<string, Stand>, down: boolean }}
 */
export function parseShots(text) {
  /** @type {Record<string, Stand>} */
  const runs = {}
  let issues = []
  let down = false
  for (const line of String(text).split('\n')) {
    const issue = ISSUE.exec(line)
    if (issue) {
      issues.push(`${issue[1]} ${issue[2].trim()}`)
      continue
    }
    if (ALL_DOWN.test(line)) {
      down = true
      continue
    }
    const v = VERDICT.exec(line)
    const s = v ? null : SILENT.exec(line)
    if (!v && !s) continue
    const [verdict, name, width, lang] = v
      ? [v[1], v[2], v[3], v[4]]
      : ['NOT MEASURED', s[1], s[2], s[3]]
    runs[`${name} ${width} ${lang}`] = { verdict, issues: issues.sort() }
    issues = []
  }
  return { runs, down }
}

/**
 * What changed between two `runs` maps; pure, so it is tested alone.
 * @param {Record<string, Stand>} before
 * @param {Record<string, Stand>} now
 */
export function compareShots(before, now) {
  const worse = []
  const better = []
  let same = 0
  for (const key of Object.keys(now).sort()) {
    const a = before[key]
    const b = now[key]
    if (!a) {
      ;(b.verdict === 'green' ? better : worse).push(
        `${key}: new, ${b.verdict}`
      )
      continue
    }
    const step = RANK[b.verdict] - RANK[a.verdict]
    const more = b.issues.length - a.issues.length
    const was = `${a.verdict}${a.issues.length ? ` (${a.issues.length})` : ''}`
    const is = `${b.verdict}${b.issues.length ? ` (${b.issues.length})` : ''}`
    if (step > 0 || (step === 0 && more > 0)) {
      const fresh = b.issues.filter(x => !a.issues.includes(x))
      worse.push(
        `${key}: ${was} -> ${is}${fresh.length ? ` · ${fresh.slice(0, 3).join(' · ')}` : ''}`
      )
    } else if (step < 0 || more < 0) better.push(`${key}: ${was} -> ${is}`)
    else same++
  }
  for (const key of Object.keys(before).sort())
    if (!now[key])
      worse.push(`${key}: vanished (was ${before[key].verdict})`)
  return { worse, better, same }
}

export function tally(runs) {
  const n = { green: 0, RED: 0, 'NOT MEASURED': 0 }
  for (const r of Object.values(runs)) n[r.verdict]++
  return n
}

function runAll() {
  const shot = join(import.meta.dirname, 'shot.mjs')
  return new Promise(done => {
    const child = spawn('node', [shot, 'all'], {
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    let out = ''
    child.stdout.on('data', c => {
      out += c
      process.stdout.write(c)
    })
    child.on('close', () => done(out))
  })
}

async function main(argv) {
  const opt = name => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const stateFile = resolve(
    opt('state') ?? join(homedir(), '.cache/tri/shot-watch.json')
  )
  const from = opt('from')
  const text = from ? readFileSync(from, 'utf8') : await runAll()
  const { runs, down } = parseShots(text)
  const n = tally(runs)
  if (down || Object.keys(runs).length === 0) {
    console.log(
      '== shot watch NOT MEASURED -- nothing was measured; the last state is kept'
    )
    return 2
  }
  const prev = existsSync(stateFile)
    ? JSON.parse(readFileSync(stateFile, 'utf8'))
    : null
  mkdirSync(dirname(stateFile), { recursive: true })
  writeFileSync(
    stateFile,
    JSON.stringify({ at: new Date().toISOString(), runs }, null, 2)
  )
  const counts = `${n.green} green, ${n.RED} RED, ${n['NOT MEASURED']} not measured`
  if (!prev) {
    console.log(`== shot watch first -- ${counts}; saved to ${stateFile}`)
    return 0
  }
  const { worse, better, same } = compareShots(prev.runs, runs)
  for (const x of worse) console.log(`   worse   ${x}`)
  for (const x of better) console.log(`   better  ${x}`)
  console.log(
    `== shot watch ${worse.length ? 'WORSE' : 'steady'} -- ${counts}; ` +
      `${worse.length} worse, ${better.length} better, ${same} same since ${prev.at}`
  )
  return worse.length ? 1 : 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  process.exit(await main(process.argv.slice(2)))
