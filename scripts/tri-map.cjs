#!/usr/bin/env node
/**
 * WHAT CAN `tri` ACTUALLY DO -- READ OUT OF `tri` ITSELF.
 *
 * 2026-09-19: I spent several cycles planting defects by hand -- copy the file,
 * patch it, run the test, revert -- while `tri mutate <file> <from> <to>
 * <test>` had been in the CLI the whole time doing exactly that ritual. The
 * reason is measurable: 101 commands are dispatched, and `tri help` describes
 * 32 of them. The other 69 exist and are invisible.
 *
 * Writing all 69 into the help text would be a second thing to keep in step
 * with the first, and it would rot the same way. So this READS the file: the
 * dispatch table for the names, and each command function's own leading comment
 * for what it does. A command cannot be missing from this map without being
 * missing from the CLI.
 *
 *   node scripts/tri-map.cjs [--undocumented] [<substring>]
 *
 * Exit: 0 always when it could read the file; 2 if it could not (a map of
 * nothing must not look like a CLI with nothing in it).
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const TRI = path.resolve(__dirname, '..', 'tri')

const PAINT = Boolean(process.stdout.isTTY)
const ESC = PAINT ? String.fromCharCode(27) : ''
const wrap = (code, s) => (PAINT ? `${ESC}[${code}m${s}${ESC}[0m` : s)
const dim = s => wrap(2, s)
const bold = s => wrap(1, s)
const yellow = s => wrap(33, s)

/**
 * Every dispatched command, with the first sentence of the comment inside its
 * own function.
 *
 * The comment is the honest source: it sits next to the code and is written by
 * whoever last changed the command, whereas a separate list is written once and
 * then drifts. Where there is no comment the entry says so rather than
 * inventing a description.
 */
function parse(source) {
  const lines = source.split('\n')

  // name(s) -> function
  const dispatch = []
  lines.forEach(line => {
    const m = /^\s{2}([^)]+)\)\s+(cmd_[a-z_0-9]+)\s/.exec(line)
    if (m) {
      dispatch.push({
        names: m[1].split('|').map(s => s.trim()),
        fn: m[2],
      })
    }
  })

  // function -> its leading comment
  const summaries = new Map()
  lines.forEach((line, i) => {
    const m = /^(cmd_[a-z_0-9]+)\s*\(\)\s*\{/.exec(line)
    if (!m) return
    /*
     * ONE LINE, NOT THE WHOLE COMMENT. Several commands carry a page of
     * history above them; printing it turns the map into the thing it exists
     * to replace. The first sentence is what a person scanning a list needs.
     */
    const said = []
    for (let k = i + 1; k < lines.length && k < i + 12; k++) {
      const text = lines[k].trim()
      if (!text.startsWith('#')) break
      const body = text.replace(/^#\s?/, '')
      if (body.startsWith('tri ')) break // the usage line, not the summary
      said.push(body)
      if (/[.!?]$/.test(body)) break
    }
    let summary = said.join(' ').trim()
    const stop = summary.search(/[.!?](\s|$)/)
    if (stop > 20) summary = summary.slice(0, stop + 1)
    if (summary.length > 110) summary = summary.slice(0, 107).trimEnd() + '...'
    summaries.set(m[1], summary)
  })

  /*
   * The help text is the body of `usage()`, found by the function rather than
   * by the first mention of the words "tri help" -- which appears earlier, in
   * a command's own comment, and made this slice start AFTER the list it was
   * supposed to search. Every documented command then looked undocumented.
   */
  const usageAt = source.indexOf('usage() {')
  const help = usageAt === -1 ? '' : source.slice(usageAt)

  return dispatch.map(d => ({
    name: d.names[0],
    aliases: d.names.slice(1),
    fn: d.fn,
    what: summaries.get(d.fn) || '',
    inHelp: d.names.some(
      n => help.includes(`tri ${n} `) || help.includes(`tri ${n}\n`)
    ),
  }))
}

function main() {
  let source
  try {
    source = fs.readFileSync(TRI, 'utf8')
  } catch (e) {
    console.error(`could not read tri: ${e.message}`)
    process.exitCode = 2
    return
  }

  const all = parse(source)
  if (all.length < 50) {
    // The CLI has had a hundred commands for weeks; a short list means the
    // parser broke, and a short list is exactly what "nothing to see" looks
    // like.
    console.error(
      `only ${all.length} commands parsed -- the reader is broken, not the CLI`
    )
    process.exitCode = 2
    return
  }

  const args = process.argv.slice(2)
  const onlyUndocumented = args.includes('--undocumented')
  const needle = args.find(a => !a.startsWith('--'))

  let rows = all
  if (onlyUndocumented) rows = rows.filter(r => !r.inHelp)
  if (needle) {
    const q = needle.toLowerCase()
    rows = rows.filter(
      r =>
        r.name.includes(q) ||
        r.aliases.some(a => a.includes(q)) ||
        r.what.toLowerCase().includes(q)
    )
  }

  console.log(
    bold(`${rows.length} of ${all.length} commands`) +
      dim(
        `  (${all.filter(r => !r.inHelp).length} are absent from \`tri help\`,` +
          ' marked *)'
      )
  )
  console.log()

  const width = Math.max(...rows.map(r => r.name.length), 4)
  for (const row of rows.sort((a, b) => a.name.localeCompare(b.name))) {
    const mark = row.inHelp ? ' ' : yellow('*')
    const what = row.what || dim('(no comment in the command -- read the code)')
    console.log(`  ${mark} ${bold(row.name.padEnd(width))}  ${what}`)
  }
}

module.exports = { parse }

if (require.main === module) main()
