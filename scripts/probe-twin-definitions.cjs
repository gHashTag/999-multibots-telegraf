#!/usr/bin/env node
'use strict'

/**
 * One name, more than one definition -- and at least one of them decides
 * access, price or identity.
 *
 * The shape came from a real find: two getParsingAccess, whose staff lists
 * differed by one shared account, so the difference between the dead copy and
 * the live one was a permission. Nothing had to be edited for the wider list
 * to take effect -- one import path would do it.
 *
 * A plain duplicate-name report is not useful on its own: four getBalance are
 * four provider adapters and entirely correct. What makes a twin worth reading
 * is that the name carries authority. So the report is split: everything is
 * counted, and the authority-bearing ones are listed with their files.
 *
 * This finds candidates. It cannot tell whether two bodies AGREE -- comparing
 * two implementations is reading, not matching -- so the output is a list to
 * read, never a verdict.
 */

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { blank, selfCheck: blankSelfCheck } = require('./lib/blank-code.cjs')

const ROOT = path.resolve(__dirname, '..')

const DEFINITION =
  /^export\s+(?:async\s+)?(?:function|const|class|enum)\s+([A-Za-z_$][\w$]*)/gm

/**
 * Names that decide access, money or identity.
 *
 * Matched WORD by word, not as substrings. The first version of this was a
 * plain alternation, and `/rate/i` matched geneRATE -- generateAudio,
 * generateVideo and generateLipSync were all reported as price-bearing, three
 * of the thirty-six. A vocabulary matched by substring reports the language,
 * not the meaning.
 */
const AUTHORITY_WORDS = new Set([
  'cost',
  'costs',
  'price',
  'prices',
  'pricing',
  'rate',
  'rates',
  'balance',
  'balances',
  'star',
  'stars',
  'admin',
  'admins',
  'staff',
  'access',
  'permission',
  'permissions',
  'token',
  'tokens',
  'secret',
  'secrets',
  'auth',
  'authorize',
  'limit',
  'limits',
  'owner',
  'owners',
  'refund',
  'refunds',
  'charge',
  'charges',
  'discount',
  'discounts',
])

/** `calculateCostInStars` -> [calculate, cost, in, stars]; `STAR_COST` -> [star, cost]. */
function words(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_$]+/)
    .filter(Boolean)
    .map(w => w.toLowerCase())
}

const AUTHORITY = {
  test: name => words(name).some(w => AUTHORITY_WORDS.has(w)),
}

function definedNames(code) {
  const out = new Set()
  for (const m of blank(code).matchAll(DEFINITION)) out.add(m[1])
  return out
}

function selfCheck() {
  blankSelfCheck()
  const fail = why => {
    console.error(`самопроверка не прошла: ${why}`)
    process.exit(2)
  }

  const positive = [
    'export function calculateCost(a) {}',
    'export const STAR_COST = 0.016',
    'export async function getBalance() {}',
    'export class Pricer {}',
    'export enum Mode {}',
  ].join('\n')
  const got = definedNames(positive)
  for (const n of [
    'calculateCost',
    'STAR_COST',
    'getBalance',
    'Pricer',
    'Mode',
  ]) {
    if (!got.has(n)) fail(`определение не распознано: ${n}`)
  }

  const negative = [
    // Not definitions. Each is rejected by a different part of the pattern:
    // no `export`, a re-export rather than a definition, a type alias, an
    // indented (so not top-level) declaration, and text inside a string.
    'const localCost = 1',
    "export { calculateCost } from './x'",
    'export type CostDetails = { a: number }',
    '  export const nestedCost = 2',
    "const s = 'export const fakeCost = 3'",
  ].join('\n')
  const bad = definedNames(negative)
  const leaked = [...bad].filter(n =>
    [
      'localCost',
      'calculateCost',
      'CostDetails',
      'nestedCost',
      'fakeCost',
    ].includes(n)
  )
  if (leaked.length) fail(`принято за определение: ${leaked.join(', ')}`)

  // The classifier needs both sides too: a name with authority must match and
  // an ordinary one must not, or every twin would be reported as interesting.
  for (const yes of [
    'calculateCostInStars',
    'METAMUSE_STAFF_IDS',
    'STAR_COST',
    'processBalanceOperation',
  ]) {
    if (!AUTHORITY.test(yes)) fail(`властное имя не распознано: ${yes}`)
  }
  for (const no of [
    'renderTemplate',
    // geneRATE contains rate, sepaRATE contains rate, and a substring matcher
    // reported all three of these as price-bearing.
    'generateAudio',
    'generateVideo',
    'separateChunks',
  ]) {
    if (AUTHORITY.test(no)) fail(`обычное имя принято за властное: ${no}`)
  }

  console.log(
    'самопроверка: определения разобраны, посторонние формы отвергнуты'
  )
}

selfCheck()

const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter(
    f => f.startsWith('src/') && f.endsWith('.ts') && !f.includes('__tests__')
  )

const where = new Map()
for (const f of files) {
  let code
  try {
    code = fs.readFileSync(path.join(ROOT, f), 'utf8')
  } catch {
    continue
  }
  for (const n of definedNames(code)) {
    if (!where.has(n)) where.set(n, [])
    where.get(n).push(f)
  }
}

const twins = [...where.entries()].filter(([, v]) => v.length > 1)
const authority = twins.filter(([n]) => AUTHORITY.test(n))

console.log(`файлов: ${files.length}, экспортируемых имён: ${where.size}`)
console.log(`определены больше чем в одном файле: ${twins.length}`)
console.log(
  `\n=== ИЗ НИХ ВЛАСТНЫЕ (доступ / цена / личность): ${authority.length} ===`
)
console.log('   (список для чтения, не вердикт: две копии могут и совпадать)\n')

for (const [name, fileList] of authority.sort(
  (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])
)) {
  console.log(`  ${name}  (${fileList.length})`)
  for (const f of fileList.sort()) console.log(`      ${f}`)
}

const ordinary = twins.length - authority.length
console.log(`\nостальные двойники: ${ordinary}`)
console.log('   (имя не решает доступ, цену или личность -- читать по случаю)')
