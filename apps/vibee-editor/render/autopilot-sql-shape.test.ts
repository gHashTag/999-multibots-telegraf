/**
 * THE SQL ITSELF, checked -- because the behavioural tests cannot see it.
 *
 * autopilot-state.test.ts drives a fake pool that substring-matches the query
 * and answers from a Map. That is the right shape for behaviour, and it is
 * BLIND to whether the SQL is valid: renaming `next_topic` to `nxt_topic` in
 * the SELECT left the whole suite green while a real Postgres answered `column
 * "nxt_topic" does not exist` and the loader fell back to a fresh state
 * forever -- which is the original outage, restored. Measured 2026-08-29 by an
 * adversarial verifier against Postgres 17.
 *
 * A real-database test would catch it, but there is no database in CI, and a
 * check that only runs on one machine is a check that does not run. So this
 * compares the queries against the table definition they must match. Both come
 * from the module itself, so drift in either direction is visible.
 *
 * This does not prove the SQL executes. It proves the two halves agree, which
 * is the failure that actually happened.
 */
import { describe, it, expect } from 'vitest'
import { TABLE, UPSERT, SELECT } from './src/autopilot-state'

/** Column names from `CREATE TABLE (...)`: the first word of each definition. */
function columnsOf(ddl: string): Set<string> {
  const body = ddl.slice(ddl.indexOf('(') + 1, ddl.lastIndexOf(')'))
  const cols = new Set<string>()
  for (const line of body.split('\n')) {
    const m = line.trim().match(/^([a-z_][a-z0-9_]*)\s+[a-z]/i)
    // Skip table-level constraints (PRIMARY KEY (...), UNIQUE (...)) -- they
    // start with a keyword, not a column name.
    if (m && !/^(primary|unique|foreign|constraint|check)$/i.test(m[1]))
      cols.add(m[1])
  }
  return cols
}

/**
 * Words that appear in these queries and are NOT columns of the table.
 *
 * Listed explicitly rather than pattern-matched: an over-clever filter would
 * silently absorb a typo'd column, which is the one thing this file exists to
 * catch. Anything new here must be a deliberate addition.
 */
const NOT_COLUMNS = new Set([
  // SQL keywords and clauses
  'insert',
  'into',
  'values',
  'on',
  'conflict',
  'do',
  'update',
  'set',
  'select',
  'from',
  'where',
  'as',
  'case',
  'when',
  'then',
  'else',
  'end',
  'create',
  'table',
  'if',
  'not',
  'exists',
  'and',
  'or',
  'null',
  'default',
  'primary',
  'key',
  'text',
  'int',
  'timestamptz',
  'date',
  'time',
  'zone',
  'at',
  // functions
  'now',
  'greatest',
  'to_char',
  // the table, and the alias PostgREST-style output uses
  'autopilot_state',
  'excluded',
  // the SELECT's output alias for day::text; deliberate, see the module comment
  'utc',
  'yyyy',
  'mm',
  'dd',
  'hh24',
  'mi',
  'ss',
  't',
  'z',
])

const DDL = columnsOf(TABLE)

/** Identifiers in a query that ought to be columns of the table. */
function suspiciousIdentifiers(sql: string): string[] {
  // Strip string literals and SQL line comments first: the format mask inside
  // to_char and the explanatory `--` comments are not identifiers, and treating
  // them as such would force noise into NOT_COLUMNS.
  const stripped = sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/'[^']*'/g, ' ')
    .replace(/"[^"]*"/g, ' ')
  const words = stripped.match(/[a-z_][a-z0-9_]*/gi) || []
  return [
    ...new Set(
      words
        .map(w => w.toLowerCase())
        .filter(w => !NOT_COLUMNS.has(w) && !DDL.has(w))
    ),
  ]
}

describe('the queries and the table definition agree', () => {
  it('the DDL really parsed -- a zero-column set would pass everything', () => {
    // The denominator rule: an empty violation list over zero columns is
    // indistinguishable from a check that never ran.
    expect(DDL.size).toBeGreaterThanOrEqual(6)
    expect([...DDL].sort()).toContain('next_topic')
  })

  it('every identifier in the UPSERT is a column of the table', () => {
    expect(suspiciousIdentifiers(UPSERT)).toEqual([])
  })

  it('every identifier in the SELECT is a column of the table', () => {
    expect(suspiciousIdentifiers(SELECT)).toEqual([])
  })

  it('the SELECT reads back every column the UPSERT writes', () => {
    // A column written and never read is state the next deploy cannot use --
    // exactly the shape of the bug this whole change is fixing.
    for (const col of [
      'day',
      'posts_today',
      'next_topic',
      'last_topic',
      'last_post_at',
    ])
      expect(SELECT.includes(col), `SELECT does not read ${col}`).toBe(true)
  })
})

describe('the concurrency guards are real, not decorative', () => {
  it('the cursor index cannot be lowered by a late writer', () => {
    expect(UPSERT).toMatch(
      /next_topic\s*=\s*GREATEST\(\s*autopilot_state\.next_topic\s*,\s*EXCLUDED\.next_topic\s*\)/i
    )
  })

  it('the TITLE follows the winning cursor instead of overwriting it', () => {
    /**
     * The defect this pins: `last_topic = EXCLUDED.last_topic` unconditionally,
     * while cursorFor resolves by title FIRST. The index guard above then buys
     * nothing -- a dying container's stale title wins and the queue walks
     * backwards. An assertion that merely looked for GREATEST could not see it,
     * because two other GREATESTs remain in the statement.
     */
    expect(UPSERT).not.toMatch(/last_topic\s*=\s*EXCLUDED\.last_topic\s*,/i)
    expect(UPSERT).toMatch(
      /last_topic\s*=\s*CASE\s+WHEN\s+EXCLUDED\.next_topic\s*>=\s*autopilot_state\.next_topic/i
    )
  })

  it('the day rolls the counter but not the cursor', () => {
    expect(UPSERT).toMatch(
      /posts_today\s*=\s*CASE\s+WHEN\s+autopilot_state\.day\s*=\s*EXCLUDED\.day/i
    )
  })
})
