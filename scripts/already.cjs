#!/usr/bin/env node
/**
 * Does this repository already answer the question I am about to build a tool
 * for?
 *
 * Written after failing that question three times in one session. A skip
 * census, a skip-reason ratchet, and a `tri skipped` verb were all rebuilt
 * from scratch while working copies sat in the tree -- and the rebuilt ones
 * were worse: a tunable line window where the original anchored to the end of
 * the previous statement, and no split between `.skip` and `.skipIf`.
 *
 * The reason it kept happening is ordinary: 90 verbs, 54 probes and 13 tool
 * tests is more inventory than anyone holds in their head, and the search that
 * would find them has to be by TOPIC, not by the name I happen to choose. I
 * grepped for `gate` and found the gate tests; I never grepped for `skip`,
 * because the thing I was about to write was called `everySkipCarriesItsReason`
 * and the thing that existed was called `skipsExplained`.
 *
 * So the corpus is prose, not identifiers: verb comments in `tri`, the header
 * comment of every script, and the doc comment of every tool test. Those say
 * what a thing is FOR, which is the only thing a name reliably fails to say.
 *
 * Usage:  node scripts/already.cjs <word> [word...]
 *         node scripts/already.cjs --self-check
 */

const fs = require('fs')
const path = require('path')
const { census } = require('./lib/read-census.cjs')

const ROOT = path.resolve(__dirname, '..')

/** Every `cmd_x() { ... }` in tri, with the comment block that opens it. */
function triVerbs(raw) {
  const out = []
  const re = /^cmd_([a-z_0-9]+)\(\)\s*\{\n((?:\s*#.*\n)*)/gm
  let m
  while ((m = re.exec(raw)) !== null) {
    out.push({
      kind: 'tri',
      name: m[1].replace(/_/g, '-'),
      text: m[2].replace(/^\s*#\s?/gm, ''),
    })
  }
  return out
}

/**
 * The opening comment of a file -- what it says it is for.
 *
 * Both shapes, because a file described only in `//` lines is still described,
 * and returning '' for it would print a result with a blank line under it.
 * That is how a search tool teaches people to stop reading its output.
 */
function header(raw) {
  const block = raw.match(/\/\*\*?([\s\S]*?)\*\//)
  if (block) return block[1].replace(/^\s*\*\s?/gm, '')
  const lines = []
  for (const line of raw.split('\n')) {
    if (/^\s*\/\//.test(line)) lines.push(line.replace(/^\s*\/\/\s?/, ''))
    else if (lines.length) break
    else if (line.trim() && !line.startsWith('#!')) break
  }
  return lines.join('\n')
}

function corpus() {
  const c = census('already')
  const items = []
  // Counted separately from `items`, because one file (tri) yields ~90 of
  // them. Reporting the census against the item count would print "read 229
  // of 309" and invent eighty unread files.
  let filesTried = 0

  filesTried++
  const triRaw = c.read1(path.join(ROOT, 'tri'))
  if (triRaw) items.push(...triVerbs(triRaw))

  const dirs = [
    ['scripts', 'script', f => f.endsWith('.cjs')],
    ['src/__tests__/tools', 'test', f => f.endsWith('.ts')],
    ['src/__tests__/money', 'test', f => f.endsWith('.ts')],
    ['src/__tests__/security', 'test', f => f.endsWith('.ts')],
  ]
  for (const [dir, kind, keep] of dirs) {
    const abs = path.join(ROOT, dir)
    if (!fs.existsSync(abs)) continue
    for (const name of fs.readdirSync(abs)) {
      if (!keep(name)) continue
      filesTried++
      const raw = c.read1(path.join(abs, name))
      if (raw === null) continue
      items.push({ kind, name: `${dir}/${name}`, text: header(raw) })
    }
  }
  return { items, c, filesTried }
}

/**
 * Ranked by how many of the words appear, then by how early. Deliberately
 * dumb: the point is to surface candidates for a human to read, not to decide.
 */
function search(items, words) {
  const lc = words.map(w => w.toLowerCase())
  return items
    .map(it => {
      const hay = `${it.name} ${it.text}`.toLowerCase()
      const hits = lc.filter(w => hay.includes(w))
      return { ...it, score: hits.length }
    })
    .filter(it => it.score > 0)
    .sort((a, b) => b.score - a.score)
}

function firstSentence(text) {
  const line = text
    .split('\n')
    .map(l => l.trim())
    .find(l => l.length > 20)
  return (line || text.trim()).slice(0, 150)
}

function selfCheck() {
  const { items } = corpus()
  if (items.length < 50) {
    console.error(`self-check FAILED: corpus is only ${items.length} items`)
    process.exit(2)
  }
  // Positive control: the exact miss this file exists to prevent. Both of
  // these were rebuilt from scratch while they already existed.
  const skip = search(items, ['skip'])
  const names = skip.map(s => s.name)
  const wantVerb = names.includes('skipped')
  const wantTest = names.some(n => n.includes('skipsExplained'))
  if (!wantVerb || !wantTest) {
    console.error(
      `self-check FAILED: searching "skip" must find the tri verb and skipsExplained; got ${names.slice(0, 8).join(', ')}`
    )
    process.exit(2)
  }
  // Negative control: a word that is in nothing must return nothing, or every
  // answer this tool gives is meaningless.
  const none = search(items, ['zzqqxplfgh'])
  if (none.length !== 0) {
    console.error(`self-check FAILED: nonsense query matched ${none.length}`)
    process.exit(2)
  }
  console.log(
    `self-check OK: ${items.length} described things; "skip" finds the verb and the ratchet, nonsense finds nothing`
  )
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--self-check')) return selfCheck()
  if (argv.length === 0) {
    console.log('usage: node scripts/already.cjs <word> [word...]')
    process.exit(1)
  }

  const { items, c, filesTried } = corpus()
  c.report(filesTried)
  const hits = search(items, argv)

  console.log(`\nописанных сущностей: ${items.length}`)
  if (hits.length === 0) {
    // Not a green light. An empty result means the words did not appear in any
    // description, and a thing can exist under words nobody thought to write.
    console.log(`по словам [${argv.join(' ')}] НИЧЕГО НЕ НАЙДЕНО.`)
    console.log(
      'Это не значит «не существует» — значит «не описано этими словами».'
    )
    console.log('Попробуй синонимы предмета, а не имя, которое ты хочешь дать.')
    return
  }
  console.log(`совпало: ${hits.length}\n`)
  for (const h of hits.slice(0, 12)) {
    const label = h.kind === 'tri' ? `tri ${h.name}` : h.name
    console.log(`  [${h.score}] ${label}`)
    console.log(`      ${firstSentence(h.text)}`)
  }
  if (hits.length > 12) console.log(`  ... ещё ${hits.length - 12}`)
}

main()
