/**
 * A DATABASE THAT KNOWS ONLY WHAT IT WAS TOLD.
 *
 * For the funnel tests (theFunnelWrites, theBotSellsTheClub). A table exists
 * after its CREATE TABLE and not before; an INSERT naming a column the CREATE
 * did not declare is refused the way Postgres refuses it; a UNIQUE INDEX on
 * `(detail->>'<key>') WHERE event = '<value>'` is enforced because the SQL
 * declared it, and ON CONFLICT DO NOTHING then inserts nothing. Any statement
 * it does not recognise THROWS -- a double that answers "ok" to everything is
 * how a real mutation once walked through a green run (AGENTS.md §6).
 *
 * It holds no copy of the code's rules: which invoices count as abandoned is
 * decided by the code under test, from rows this double returns as stored.
 */

type Row = Record<string, any>

export interface StrictEventsDb {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }>
  rows: (table: string) => Row[]
  creates: () => number
  /** Seed a row with an explicit created_at, through the declared columns only. */
  insertRaw: (table: string, row: Row) => void
}

export function strictEventsDb(): StrictEventsDb {
  const tables = new Map<string, { columns: string[]; rows: Row[] }>()
  const uniques: Array<{ table: string; key: string; event: string }> = []
  let seq = 0
  let createCount = 0

  const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

  function tableOf(name: string) {
    const t = tables.get(name)
    if (!t) throw new Error(`relation "${name}" does not exist`)
    return t
  }

  function put(name: string, row: Row, onConflictNothing: boolean): Row | null {
    const t = tableOf(name)
    for (const col of Object.keys(row)) {
      if (!t.columns.includes(col)) {
        throw new Error(`column "${col}" of relation "${name}" does not exist`)
      }
    }
    const stored: Row = {
      id: String(++seq),
      created_at: new Date().toISOString(),
      ...row,
    }
    for (const u of uniques.filter(u => u.table === name)) {
      if (stored.event !== u.event) continue
      const k = stored.detail?.[u.key]
      const clash = t.rows.some(
        r => r.event === u.event && r.detail?.[u.key] === k
      )
      if (clash) {
        if (onConflictNothing) return null
        throw new Error('duplicate key value violates unique constraint')
      }
    }
    t.rows.push(stored)
    return stored
  }

  async function query(sql: string, params: unknown[] = []) {
    const s = norm(sql)

    let m = /^CREATE TABLE IF NOT EXISTS (\w+) \((.*)\)$/i.exec(s)
    if (m) {
      createCount++
      if (!tables.has(m[1])) {
        const columns = m[2]
          .split(',')
          .map(c => c.trim().split(' ')[0])
          .filter(Boolean)
        tables.set(m[1], { columns, rows: [] })
      }
      return { rows: [] }
    }

    m =
      /^CREATE UNIQUE INDEX IF NOT EXISTS \w+ ON (\w+) \(\(detail->>'(\w+)'\)\) WHERE event = '(\w+)'$/i.exec(
        s
      )
    if (m) {
      tableOf(m[1])
      if (!uniques.some(u => u.table === m![1] && u.key === m![2])) {
        uniques.push({ table: m[1], key: m[2], event: m[3] })
      }
      return { rows: [] }
    }

    m = /^CREATE INDEX IF NOT EXISTS \w+ ON (\w+) \(([\w\s,]+)\)$/i.exec(s)
    if (m) {
      const t = tableOf(m[1])
      for (const c of m[2].split(',').map(x => x.trim().split(' ')[0])) {
        if (!t.columns.includes(c)) {
          throw new Error(`column "${c}" does not exist`)
        }
      }
      return { rows: [] }
    }

    m =
      /^INSERT INTO (\w+) \(([\w\s,]+)\) VALUES \(([$\d\s,]+)\)( ON CONFLICT DO NOTHING)?( RETURNING id)?$/i.exec(
        s
      )
    if (m) {
      const cols = m[2].split(',').map(c => c.trim())
      const slots = m[3].split(',').map(v => Number(v.trim().slice(1)) - 1)
      if (cols.length !== slots.length) throw new Error('INSERT arity mismatch')
      const row: Row = {}
      cols.forEach((c, i) => {
        const v = params[slots[i]]
        // JSONB arrives as text, the way `pg` sends it; store it parsed.
        row[c] = c === 'detail' && typeof v === 'string' ? JSON.parse(v) : v
      })
      const stored = put(m[1], row, !!m[4])
      return { rows: stored && m[5] ? [{ id: stored.id }] : [] }
    }

    m =
      /^SELECT id::text AS id, telegram_id, bot_name, event, detail, created_at FROM (\w+) WHERE event = ANY\(\$1\) AND created_at >= \$2 ORDER BY created_at ASC$/i.exec(
        s
      )
    if (m) {
      const wanted = params[0]
      if (!Array.isArray(wanted)) throw new Error('ANY($1) needs an array')
      const since = Date.parse(String(params[1]))
      const rows = tableOf(m[1])
        .rows.filter(
          r => wanted.includes(r.event) && Date.parse(r.created_at) >= since
        )
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map(r => ({ ...r }))
      return { rows }
    }

    throw new Error(`strictEventsDb does not understand: ${s.slice(0, 120)}`)
  }

  return {
    query,
    rows: table => (tables.get(table)?.rows ?? []).map(r => ({ ...r })),
    creates: () => createCount,
    insertRaw: (table, row) => {
      const stored = put(table, row, false)
      if (stored && row.created_at) stored.created_at = row.created_at
    },
  }
}
