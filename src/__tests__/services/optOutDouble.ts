/**
 * A DOUBLE OF `assistant_opt_outs` THAT READS THE SQL IT IS GIVEN.
 *
 * Not a lookup by statement name: every WHERE conjunct and every SET
 * assignment is parsed out of the query text and applied. So deleting
 * `AND owner_told_at IS NULL` from the real statement changes what this double
 * does -- which is the only way a test on top of it can catch that mutation
 * (blind-guards, form 21). A statement shape it was not taught throws.
 *
 * `down = true` is a database that does not answer.
 */
export interface OptOutRow {
  owner_id: string
  client_id: string
  active: boolean
  since: string
  source: string
  owner_told_at: string | null
  client_told_at: string | null
  resumed_at: string | null
}

const flat = (sql: string) => sql.replace(/\s+/g, ' ').trim()

export function optOutDouble() {
  const rows = new Map<string, OptOutRow>()
  const seen: string[] = []
  let created = false
  const state = { down: false }
  const key = (o: unknown, c: unknown) => `${String(o)}:${String(c)}`
  const now = () => new Date().toISOString()

  /** `a AND b AND c` against one row. */
  function matches(where: string, r: OptOutRow, p: unknown[]): boolean {
    for (const raw of where.split(/ AND /)) {
      const c = raw.trim()
      let m: RegExpExecArray | null
      if ((m = /^(owner_id|client_id) = \$(\d)$/.exec(c))) {
        if ((r as any)[m[1]] !== String(p[Number(m[2]) - 1])) return false
      } else if (c === 'active') {
        if (!r.active) return false
      } else if ((m = /^(owner_told_at|client_told_at) IS NULL$/.exec(c))) {
        if ((r as any)[m[1]] !== null) return false
      } else if (c === 'assistant_opt_outs.active = false') {
        if (r.active) return false
      } else throw new Error(`opt-out double: condition not understood: ${c}`)
    }
    return true
  }

  /** `a = now(), b = NULL, c = true` onto one row. */
  function assign(set: string, r: OptOutRow): void {
    for (const raw of set.split(/, /)) {
      const m = /^(\w+) = (.+)$/.exec(raw.trim())
      if (!m)
        throw new Error(`opt-out double: assignment not understood: ${raw}`)
      const [, col, val] = m
      if (!(col in r)) throw new Error(`opt-out double: no column ${col}`)
      ;(r as any)[col] =
        val === 'now()'
          ? now()
          : val === 'NULL'
            ? null
            : val === 'true'
              ? true
              : val === 'false'
                ? false
                : /^'(.*)'$/.test(val)
                  ? val.slice(1, -1)
                  : (() => {
                      throw new Error(
                        `opt-out double: value not understood: ${val}`
                      )
                    })()
    }
  }

  async function query(sql: string, params: unknown[] = []) {
    if (state.down) throw new Error('connect ECONNREFUSED (double is down)')
    const q = flat(sql)
    seen.push(q)
    if (/^CREATE TABLE IF NOT EXISTS assistant_opt_outs \(/.test(q)) {
      for (const col of [
        'owner_id text NOT NULL',
        'client_id text NOT NULL',
        'active boolean NOT NULL DEFAULT true',
        'owner_told_at timestamptz',
        'client_told_at timestamptz',
        'PRIMARY KEY (owner_id, client_id)',
      ])
        if (!q.includes(col))
          throw new Error(`opt-out double: table lacks ${col}`)
      created = true
      return { rows: [] }
    }
    if (!created)
      throw new Error('relation "assistant_opt_outs" does not exist')

    let m = /^SELECT client_id, since FROM assistant_opt_outs WHERE (.+)$/.exec(
      q
    )
    if (m) {
      const where = m[1]
      return {
        rows: [...rows.values()]
          .filter(r => matches(where, r, params))
          .map(r => ({ client_id: r.client_id, since: r.since })),
      }
    }

    m =
      /^INSERT INTO assistant_opt_outs \(owner_id, client_id, active, since, source, owner_told_at, client_told_at, resumed_at\) VALUES \(\$1, \$2, true, now\(\), 'client', NULL, NULL, NULL\) ON CONFLICT \(owner_id, client_id\) DO UPDATE SET (.+?)(?: WHERE (.+?))? RETURNING client_id$/.exec(
        q
      )
    if (m) {
      const [, set, where] = m
      const k = key(params[0], params[1])
      const old = rows.get(k)
      if (!old) {
        rows.set(k, {
          owner_id: String(params[0]),
          client_id: String(params[1]),
          active: true,
          since: now(),
          source: 'client',
          owner_told_at: null,
          client_told_at: null,
          resumed_at: null,
        })
        return { rows: [{ client_id: String(params[1]) }] }
      }
      if (where && !matches(where, old, params)) return { rows: [] }
      assign(set, old)
      return { rows: [{ client_id: old.client_id }] }
    }

    m =
      /^UPDATE assistant_opt_outs SET (.+?) WHERE (.+?)( RETURNING client_id)?$/.exec(
        q
      )
    if (m) {
      const [, set, where, returning] = m
      const hit = [...rows.values()].filter(r => matches(where, r, params))
      for (const r of hit) assign(set, r)
      return {
        rows: returning ? hit.map(r => ({ client_id: r.client_id })) : [],
      }
    }
    throw new Error(`opt-out double: statement not understood: ${q}`)
  }

  return { query, rows, seen, state }
}
