import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A COLUMN THE CODE READS MUST BE A COLUMN SOMETHING CREATES.
 *
 * `/api/tokens/verify` -- the mini-app's answer to "did my payment arrive?" --
 * both reads and writes `token_invoices.star_tx_id`, and NOTHING in this
 * repository ever created it. Not the CREATE TABLE, not the ALTER that adds
 * the two cancellation columns, not any migration, not any commit in the
 * history.
 *
 * Measured read-only against production on 2026-09-09: token_invoices carried
 * id, telegram_id, tokens, stars, created_at, redeemed, cancelled_at,
 * cancel_reason -- and no star_tx_id. Control: the same query found
 * cancel_reason, so it was not silently empty.
 *
 * The route's FIRST query names that column, so it threw for anybody with an
 * unredeemed invoice -- which is all five invoices this product has ever
 * minted, every one still `redeemed = false`. That is exactly the residue a
 * route that cannot run leaves behind, and it was going to greet the first
 * real sale.
 *
 * A typo in a column name fails the same way and reads the same in the log.
 * So the rule is structural: for the tables this test names, every column the
 * code mentions must be one the code also creates.
 */

const TABLES = [
  'token_invoices',
  'user_tokens',
  'star_payments',
  'agent_proposals',
]

/** Words that appear inside these SQL strings and are not column names. */
const SQL_WORDS = new Set([
  'select',
  'from',
  'where',
  'and',
  'or',
  'not',
  'null',
  'is',
  'insert',
  'into',
  'values',
  'on',
  'conflict',
  'do',
  'nothing',
  'update',
  'set',
  'delete',
  'returning',
  'order',
  'by',
  'asc',
  'desc',
  'limit',
  'create',
  'table',
  'if',
  'exists',
  'add',
  'column',
  'alter',
  'primary',
  'key',
  'default',
  'now',
  'serial',
  'text',
  'int',
  'boolean',
  'timestamptz',
  'jsonb',
  'false',
  'true',
  'excluded',
  'count',
  'sum',
  'max',
  'min',
  'coalesce',
  'filter',
  'group',
  'as',
  'distinct',
  'with',
  'union',
  'all',
  'left',
  'join',
  'inner',
  'outer',
  'interval',
  'to_char',
  'date_trunc',
  'string_agg',
  'case',
  'when',
  'then',
  'else',
  'end',
  'having',
  'offset',
  'gt',
  'lt',
  'in',
  'like',
  'ilike',
  'between',
  'cast',
  'nullif',
  'unique',
  'references',
  'constraint',
  'index',
  'using',
  'begin',
  'commit',
  'rollback',
  ...TABLES,
])

function sources(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.vite-cache')
      continue
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) sources(full, acc)
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) acc.push(full)
  }
  return acc
}

/**
 * EXTRACT PER FILE, AND ANCHOR ON THE SQL VERB.
 *
 * Two bugs in the first version of this scanner, both found by its own
 * population assertion rather than by reading it:
 *
 *  1. It joined every file into one string BEFORE pulling backtick blocks
 *     out. One file with an odd number of backticks pairs the rest of the
 *     repository up wrongly, so blocks from unrelated files merge and most
 *     disappear. Measured: render-server.ts alone holds 66 SQL blocks; the
 *     joined scan found 6 in the whole service.
 *  2. It stripped comments first, and `/*` occurring inside a template
 *     literal opens a false comment that swallows real code. Measured:
 *     `charge_id` appears 3 times in render-server.ts and 0 times after
 *     stripping.
 *
 * Both are fixed by doing less: read each file on its own, and take only
 * blocks that BEGIN with a SQL verb. Prose starts with a word, so comments
 * cannot match, and no comment-stripping is needed at all.
 */
const SQL_BLOCK =
  /`(\s*(?:SELECT|INSERT|UPDATE|DELETE|ALTER|CREATE)[\s\S]*?)`/gi

const FILES = sources(__dirname)
const BLOCKS: string[] = []
for (const f of FILES) {
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(SQL_BLOCK)) BLOCKS.push(m[1])
}
const OURS = BLOCKS.filter(b => TABLES.some(t => b.includes(t)))

/** Column names any DDL in this tree creates, for the tables above. */
function declared(blocks: string[]): Set<string> {
  const out = new Set<string>()
  for (const b of blocks) {
    for (const t of TABLES) {
      const re = new RegExp(
        `CREATE TABLE IF NOT EXISTS ${t}\\s*\\(([\\s\\S]*)`,
        'i'
      )
      const m = re.exec(b)
      if (!m) continue
      for (const line of m[1].split(',')) {
        const name = line.trim().split(/\s+/)[0]
        if (name && /^[a-z_][a-z0-9_]*$/.test(name)) out.add(name)
      }
    }
    for (const m of b.matchAll(
      /ADD COLUMN IF NOT EXISTS\s+([a-z_][a-z0-9_]*)/gi
    )) {
      out.add(m[1].toLowerCase())
    }
  }
  return out
}

/** Column-shaped identifiers inside SQL that names one of the tables. */
function used(blocks: string[]): Set<string> {
  const out = new Set<string>()
  for (const b of blocks) {
    for (const w of b.matchAll(/\b([a-z_][a-z0-9_]{2,})\b/g)) {
      const name = w[1].toLowerCase()
      if (SQL_WORDS.has(name)) continue
      if (!name.includes('_')) continue
      out.add(name)
    }
  }
  return out
}

describe('every column the code uses is a column something creates', () => {
  const DECLARED = declared(OURS)
  const USED = used(OURS)

  it('both sides of the comparison are real', () => {
    // Positive controls: a column that IS created, and one that IS used.
    expect(FILES.length).toBeGreaterThan(50)
    // The population, stated out loud. A census that collapses to a handful
    // is reporting on its own extraction, not on the code.
    expect(OURS.length).toBeGreaterThanOrEqual(12)
    expect(DECLARED.has('cancel_reason')).toBe(true)
    expect(DECLARED.has('telegram_id')).toBe(true)
    /*
     * The population NAMED, not merely counted. A size assertion says the
     * scanner found something; naming the columns says it found the right
     * something -- charge_id and secret_digest live in two files the first
     * version of this scanner lost entirely, so their presence is what
     * proves the extraction reaches past render-server.ts.
     */
    for (const col of [
      'telegram_id',
      'charge_id',
      'secret_digest',
      'star_tx_id',
      'created_at',
    ]) {
      expect(USED.has(col), `${col}: вне охвата сканера`).toBe(true)
    }
  })

  /**
   * The self-check that matters: with the fix reverted, the scanner must name
   * the exact column that shipped missing. Without this, a matcher that finds
   * nothing looks identical to a repository that is clean.
   */
  it('the scanner names a column that no DDL creates', () => {
    const withoutTheFix = OURS.map(b =>
      b.replace(/ADD COLUMN IF NOT EXISTS\s+star_tx_id text/gi, '')
    )
    const missing = [...used(withoutTheFix)].filter(
      c => !declared(withoutTheFix).has(c)
    )
    expect(missing).toContain('star_tx_id')
  })

  it('no column is used that nothing creates', () => {
    const missing = [...USED].filter(c => !DECLARED.has(c)).sort()
    expect(missing).toEqual([])
  })
})
