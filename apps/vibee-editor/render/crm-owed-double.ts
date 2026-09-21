/**
 * A crm_owed TABLE THAT READS THE SQL IT IS GIVEN.
 *
 * The first double for this table matched one SELECT by its exact text and
 * answered everything else with an empty list. Adding a column to that SELECT
 * made it answer nothing at all, and an UPDATE it did not understand was a
 * silent success -- a double that decides the answer for the code
 * (.claude/skills/blind-guards, forms 1 and 2).
 *
 * This one knows the table's columns and the statement shapes crm-owed.ts
 * uses, evaluates their SET and WHERE clauses, and THROWS on anything else:
 * an unknown column, a column the table does not have yet (before the ALTER
 * that adds it), a statement shape it has not been taught. A test that goes
 * green against it went green against the same rules Postgres would apply.
 */

const BASE = ['owner_id', 'lead_id', 'what', 'why', 'at', 'settled_at']
const LATER = ['task_id', 'task_at', 'ready_url', 'ready_at']

export type OwedRow = Record<string, unknown>

export interface OwedDouble {
  rows: OwedRow[]
  statements: string[]
  query: (sql: string, params?: unknown[]) => Promise<{ rows: OwedRow[] }>
}

/** Split on a separator at depth 0 (outside parentheses). */
function splitTop(s: string, sep: RegExp): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === '(') depth++
    if (c === ')') depth--
    if (depth === 0) {
      const m = sep.exec(s.slice(i))
      if (m && m.index === 0) {
        out.push(cur.trim())
        cur = ''
        i += m[0].length
        continue
      }
    }
    cur += c
    i++
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

export function owedDouble(
  o: {
    now?: () => Date
    /** Rows of a table created before the late-picture columns existed. */
    legacy?: OwedRow[]
  } = {}
): OwedDouble {
  const now = o.now ?? (() => new Date('2026-09-21T12:00:00Z'))
  const columns = new Set<string>(o.legacy ? BASE : [])
  const rows: OwedRow[] = (o.legacy ?? []).map(r => ({ ...r }))
  const statements: string[] = []

  const known = (col: string) => {
    const c = col.replace(/^crm_owed\./, '').trim()
    if (!columns.has(c))
      throw new Error(`column "${c}" of relation "crm_owed" does not exist`)
    return c
  }

  const value = (
    expr: string,
    p: unknown[],
    row: OwedRow,
    excluded?: OwedRow
  ): unknown => {
    const e = expr.trim()
    const param = /^\$(\d+)$/.exec(e)
    if (param) return p[Number(param[1]) - 1]
    if (/^now\(\)$/i.test(e)) return now()
    if (/^NULL$/i.test(e)) return null
    const ex = /^EXCLUDED\.(\w+)$/i.exec(e)
    if (ex) return excluded?.[known(ex[1])]
    const co = /^COALESCE\((\w+),\s*now\(\)\)$/i.exec(e)
    if (co) return row[known(co[1])] ?? now()
    if (/^'[^']*'$/.test(e)) return e.slice(1, -1)
    throw new Error(`crm_owed double: unknown expression "${e}"`)
  }

  const holds = (cond: string, p: unknown[], row: OwedRow): boolean => {
    const c = cond.trim()
    const ands = splitTop(c, /^\s+AND\s+/i)
    if (ands.length > 1) return ands.every(x => holds(x, p, row))
    if (c.startsWith('(') && c.endsWith(')'))
      return splitTop(c.slice(1, -1), /^\s+OR\s+/i).some(x => holds(x, p, row))
    let m = /^([\w.]+) IS NOT NULL$/i.exec(c)
    if (m) return row[known(m[1])] != null
    m = /^([\w.]+) IS NULL$/i.exec(c)
    if (m) return row[known(m[1])] == null
    m = /^([\w.]+) = \$(\d+)$/.exec(c)
    if (m) return String(row[known(m[1])]) === String(p[Number(m[2]) - 1])
    throw new Error(`crm_owed double: unknown condition "${c}"`)
  }

  const assign = (
    set: string,
    p: unknown[],
    row: OwedRow,
    excluded?: OwedRow
  ) => {
    const next: OwedRow = {}
    for (const a of splitTop(set, /^,/)) {
      const m = /^(\w+) = ([\s\S]+)$/.exec(a.trim())
      if (!m) throw new Error(`crm_owed double: unknown assignment "${a}"`)
      next[known(m[1])] = value(m[2], p, row, excluded)
    }
    Object.assign(row, next)
  }

  const select = (cols: string, row: OwedRow): OwedRow => {
    const out: OwedRow = {}
    for (const c of cols.split(',').map(x => x.trim())) out[c] = row[known(c)]
    return out
  }

  const query = async (sql: string, p: unknown[] = []) => {
    const flat = sql.replace(/\s+/g, ' ').trim()
    statements.push(flat)
    if (/^CREATE TABLE IF NOT EXISTS crm_owed \(/.test(flat)) {
      for (const c of BASE) columns.add(c)
      return { rows: [] }
    }
    if (/^CREATE INDEX IF NOT EXISTS crm_owed_open ON crm_owed/.test(flat))
      return { rows: [] }
    let m = /^ALTER TABLE crm_owed (ADD COLUMN IF NOT EXISTS .+)$/.exec(flat)
    if (m) {
      for (const part of m[1].split(',')) {
        const col = /ADD COLUMN IF NOT EXISTS (\w+) \w+/.exec(part.trim())
        if (!col) throw new Error(`crm_owed double: unknown ALTER "${part}"`)
        if (!LATER.includes(col[1]) && !BASE.includes(col[1]))
          throw new Error(`crm_owed double: unexpected column ${col[1]}`)
        columns.add(col[1])
      }
      return { rows: [] }
    }
    m =
      /^INSERT INTO crm_owed \(([^)]+)\) VALUES \(([^)]+)\) ON CONFLICT \(owner_id, lead_id\) (DO NOTHING|DO UPDATE SET (.+?) WHERE (.+))$/.exec(
        flat
      )
    if (m) {
      const cols = m[1].split(',').map(c => known(c))
      const vals = m[2].split(',').map(v => v.trim())
      const incoming: OwedRow = { at: now(), settled_at: null }
      for (const c of LATER) if (columns.has(c)) incoming[c] = null
      cols.forEach((c, i) => (incoming[c] = value(vals[i], p, incoming)))
      const hit = rows.find(
        r =>
          String(r.owner_id) === String(incoming.owner_id) &&
          String(r.lead_id) === String(incoming.lead_id)
      )
      if (!hit) {
        rows.push(incoming)
        return { rows: [] }
      }
      if (m[3] === 'DO NOTHING') return { rows: [] }
      if (holds(m[5], p, hit)) assign(m[4], p, hit, incoming)
      return { rows: [] }
    }
    m = /^UPDATE crm_owed SET (.+?) WHERE (.+?)( RETURNING (\w+))?$/.exec(flat)
    if (m) {
      const hits = rows.filter(r => holds(m![2], p, r))
      for (const r of hits) assign(m[1], p, r)
      return {
        rows: m[4] ? hits.map(r => ({ [m![4]]: r[known(m![4])] })) : [],
      }
    }
    m = /^SELECT (.+?) FROM crm_owed WHERE (.+)$/.exec(flat)
    if (m) {
      return {
        rows: rows.filter(r => holds(m![2], p, r)).map(r => select(m![1], r)),
      }
    }
    throw new Error(`crm_owed double: statement not understood: ${flat}`)
  }
  return { rows, statements, query }
}
