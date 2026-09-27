#!/usr/bin/env node
/**
 * tri main-drift [base] [--no-fetch]
 *
 * Main moved while the gates ran: do they still hold for the merged tree?
 *
 * WHY. `tri gate` stamps the tree the checks ran on. A squash merge lands
 * that tree ON TOP of whatever main has become since, so the tree that
 * deploys is not the tree that was gated. Loop turns 9 and 10 (27.09.2026)
 * answered this by hand before every merge -- which commits landed, which
 * files, do any reach the render, the player or their dependencies -- and
 * once the answer was "yes, the lockfiles" (#3137) and changed the plan.
 *
 * The gated code is the render, the player, the shared packages, and the
 * dependency manifests anywhere (a lockfile moves every test). Anything
 * else -- a skill, the journal, `tri` itself -- does not touch what the
 * full runs and the image gate measured.
 *
 * Exit 0: nothing gated moved (the gates hold). Exit 1: re-run them after
 * merging base in; the files are listed.
 */
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const noFetch = args.includes('--no-fetch')
const base = args.find(a => !a.startsWith('--')) ?? 'origin/main'
const git = (...a) =>
  execFileSync('git', a, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

if (!noFetch && base.startsWith('origin/')) {
  try {
    git('fetch', '-q', 'origin', base.slice('origin/'.length))
  } catch {
    console.log(
      `could not fetch ${base}: the answer below is for the last fetch`
    )
  }
}

const commits = git('log', '--format=%h %s', `HEAD..${base}`)
  .split('\n')
  .filter(Boolean)
if (!commits.length) {
  console.log(
    `${base} has nothing this branch lacks: the gates hold as they are`
  )
  process.exit(0)
}
const mergeBase = git('merge-base', 'HEAD', base).trim()
const files = git('diff', '--name-only', mergeBase, base)
  .split('\n')
  .filter(Boolean)

const GATED = [
  /^apps\/vibee-editor\/render\//,
  /^apps\/vibee-editor\/player\//,
  /^apps\/vibee-editor\/packages\//,
  /(^|\/)package(-lock)?\.json$/,
  /(^|\/)bun\.lockb?$/,
]
const touched = files.filter(f => GATED.some(re => re.test(f)))

console.log(`${base} moved ${commits.length} commit(s) since this branch:`)
for (const c of commits.slice(0, 10)) console.log(`  ${c}`)
if (commits.length > 10) console.log(`  ... and ${commits.length - 10} more`)
if (!touched.length) {
  console.log(
    `== drift: none of ${files.length} file(s) is gated code -- the gates of this tree hold for the merged one`
  )
  process.exit(0)
}
console.log(
  `== drift: ${touched.length} gated file(s) moved -- merge ${base} in and run the gates again:`
)
for (const f of touched.slice(0, 30)) console.log(`  ${f}`)
if (touched.length > 30) console.log(`  ... and ${touched.length - 30} more`)
process.exit(1)
