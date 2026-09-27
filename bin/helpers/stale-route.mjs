#!/usr/bin/env node
/**
 * tri stale-route <old> <new> [dir] -- where the words a model reads still
 * point at an old route.
 *
 * Owner, 2026-09-27: "why does the agent not understand the video made of
 * three frames -- it keeps doing it the old way". The new tool existed and was
 * offered; five places in the prompts and tool answers still named the old
 * template with nothing about the new one (the gift line, the package in the
 * brief, leela_plan's hint, the Queen's block, the plan read). A new format is
 * not a new tool: every place a model decides "which one" has to say it.
 *
 * This lists every line of `dir` (default: the render's src/agent, tests left
 * out) where `old` (a regex, e.g. 'LeelaPlanReel|OLD_PLAN_REEL') sits inside a
 * string -- words a model reads -- and neither `new` nor the guard phrase
 * (--guard, default "только если") appears within three lines of it; `new`
 * is a regex too, so a name said through a constant counts
 * ('crm_story_reel|SELLER_TOOL').
 * A line marked `stale-route-ok: <reason>` is a known exception.
 * Exit 1 when any is found.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const args = process.argv.slice(2)
const guardAt = args.indexOf('--guard')
const guard = guardAt >= 0 ? args.splice(guardAt, 2)[1] : 'только если' // cyrillic-ok: the guard phrase the prompts use
const [oldRe, fresh, dirArg] = args
if (!oldRe || !fresh) {
  console.error(
    "usage: tri stale-route '<old regex>' '<new name>' [dir] [--guard phrase]"
  )
  process.exit(2)
}
const ROOT = join(import.meta.dirname, '..', '..')
const dir =
  dirArg ?? join(ROOT, 'apps', 'vibee-editor', 'render', 'src', 'agent')
const old = new RegExp(oldRe)
const freshRe = new RegExp(fresh)
// The old name inside a string: after a quote or a backtick on the same line,
// or inside a ${...} of a template literal.
const inString = new RegExp(
  `['"\`][^'"\`]*(?:${oldRe})|\\$\\{[^}]*(?:${oldRe})`
)

const files = []
const walk = d => {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) files.push(p)
  }
}
walk(dir)

const stale = []
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (!old.test(line) || !inString.test(line)) return
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
    if (/stale-route-ok:/.test(line)) return
    const near = lines.slice(Math.max(0, i - 3), i + 4).join('\n')
    if (freshRe.test(near) || near.includes(guard)) return
    stale.push(`${relative(ROOT, file)}:${i + 1}  ${line.trim().slice(0, 140)}`)
  })
}
for (const s of stale) console.log(s)
console.log(
  stale.length
    ? `-- ${stale.length} place(s) a model reads name ${oldRe} with nothing of ${fresh} --`
    : `-- no place a model reads names ${oldRe} without ${fresh} or "${guard}" --`
)
process.exit(stale.length ? 1 : 0)
