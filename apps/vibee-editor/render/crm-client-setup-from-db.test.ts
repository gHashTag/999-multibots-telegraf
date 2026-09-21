/**
 * CLIENT PACKAGES COME FROM THE DATABASE, AND NOBODY IS PICKED BY DEFAULT.
 *
 * The repository is public, and until #2712 it carried three real client
 * dossiers and one real person's id as the default of four tools. What this
 * file pins:
 *
 *   - the owner uploads a package into `crm_client_packages`, and
 *     crm_client_setup installs it from there -- through a Postgres double
 *     that knows only the tables the code itself creates and REFUSES any
 *     column nobody created, so a query that drifts from its DDL fails here;
 *   - a package that is neither uploaded nor bundled is refused by name;
 *   - a package is installed only for the person it names;
 *   - upload is the owner's: anybody else is refused before a single query;
 *   - no id, no answer: setup, profile and upload each refuse an empty call.
 *
 * Every id here is invented (9000000xx).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { ToolContext } from './src/agent/tools'

const OWNER = '900000090'
const CLIENT = '900000091'
const SOMEONE_ELSE = '900000092'
const STRANGER = '900000093'
const PACKAGE = 'fictional-studio'

const PROFILE = {
  telegram_id: CLIENT,
  name: 'Robin',
  not_name: 'Bobby',
  status: 'draft',
  skill_prefix: 'Studio: ',
  identity_rules: ['The client is called Robin. Never Bobby.'],
  forbidden: ['Prices the client did not state'],
  content_plan: {
    goal: 'Studio: first month',
    intent: 'One piece at a time.',
    template_id: null,
    items: [
      { title: 'The first firing', note: 'Process, no product shot.' },
      { title: 'The cracked bowl', note: 'An honest failure.' },
    ],
  },
}
const SOUL = '# SOUL: Robin\n\nСтатус: ЧЕРНОВИК\n\nShort sentences.' // cyrillic-ok
const SKILLS = [
  {
    name: 'first-answer.md',
    content: '# first answer\n\nGreet Robin by name.',
  },
  {
    name: 'drafting',
    content: 'No heading here: the name comes from the file.',
  },
]

type Row = Record<string, unknown>

/** Words inside these SQL strings that are not column names. */
const SQL_WORDS = new Set(
  (
    'select from where and or not null is insert into values on conflict do ' +
    'nothing update set returning order by desc asc limit nulls last first ' +
    'now count int integer text jsonb timestamptz serial as in exists any ' +
    'distinct group having join left inner true false default primary key ' +
    'unique references cascade delete if create table alter add column index ' +
    'constraint drop'
  ).split(' ')
)

/**
 * A Postgres double that knows only what the code creates.
 *
 * Tables and columns are learned from the code's own CREATE TABLE / ALTER
 * TABLE ADD COLUMN, never declared here, so the double cannot be told what it
 * wants to hear. A statement that names a table nobody created, or a column
 * the table does not have, throws the way Postgres would. On top of that it
 * behaves like a table for the statement shapes this module uses.
 */
function strictPool(seed: Record<string, Row[]> = {}) {
  const schema = new Map<string, Set<string>>()
  const tables = new Map<string, Row[]>()
  const log: string[] = []
  let serial = 100

  const splitTop = (body: string) => {
    const out: string[] = []
    let depth = 0
    let cur = ''
    for (const ch of body) {
      if (ch === '(') depth++
      if (ch === ')') depth--
      if (ch === ',' && depth === 0) {
        out.push(cur)
        cur = ''
      } else cur += ch
    }
    if (cur.trim()) out.push(cur)
    return out.map(s => s.trim())
  }

  const rowsOf = (t: string) => {
    if (!schema.has(t)) throw new Error(`relation "${t}" does not exist`)
    if (!tables.has(t)) tables.set(t, [...(seed[t] ?? [])])
    return tables.get(t)!
  }

  /** Every identifier must be a column of a table the statement names. */
  const checkColumns = (q: string) => {
    // `ON CONFLICT ... DO UPDATE SET` names no table.
    const named = [
      ...q.matchAll(
        /\b(?:FROM|INTO|JOIN)\s+([a-z_][a-z0-9_]*)|(?<!DO )\bUPDATE\s+([a-z_][a-z0-9_]*)/gi
      ),
    ].map(m => m[1] ?? m[2])
    const real = named.filter(
      t => !/^pg_/.test(t) && t !== 'information_schema'
    )
    for (const t of real)
      if (!schema.has(t)) throw new Error(`relation "${t}" does not exist`)
    if (!real.length) return
    const allowed = new Set<string>()
    for (const t of real) for (const c of schema.get(t)!) allowed.add(c)
    const words = q
      .replace(/'[^']*'/g, ' ')
      .replace(/\$\d+/g, ' ')
      .replace(/::[a-z_]+/gi, ' ')
      .match(/[a-z_][a-z0-9_]*/gi)
    for (const w of words ?? []) {
      const lw = w.toLowerCase()
      if (SQL_WORDS.has(lw) || real.includes(w)) continue
      if (!allowed.has(w)) throw new Error(`column "${w}" does not exist`)
    }
  }

  /** `a = $1 AND b IS NULL AND (c = $2 OR c IS NULL)` over a row. */
  const whereOf = (cond: string | undefined, params: unknown[]) => {
    const parts = cond ? cond.split(/\s+AND\s+/i) : []
    return (r: Row) =>
      parts.every(p => {
        const either = p.match(/^\((\w+) = \$(\d+) OR \1 IS NULL\)$/)
        if (either)
          return r[either[1]] == null || r[either[1]] === params[+either[2] - 1]
        const eq = p.match(/^(\w+) = \$(\d+)$/)
        if (eq) return r[eq[1]] === params[+eq[2] - 1]
        const isNull = p.match(/^(\w+) IS NULL$/)
        if (isNull) return r[isNull[1]] == null
        throw new Error(`double cannot evaluate: ${p}`)
      })
  }

  const valueOf = (expr: string, params: unknown[]) => {
    const e = expr.trim()
    const p = e.match(/^\$(\d+)(?:::\w+)?$/)
    if (p) return params[+p[1] - 1]
    if (/^now\(\)$/i.test(e)) return 'now'
    throw new Error(`double cannot evaluate value: ${e}`)
  }

  const assignments = (set: string, params: unknown[]) =>
    splitTop(set).map(a => {
      const m = a.match(/^(\w+) = (.+)$/)
      if (!m) throw new Error(`double cannot evaluate SET: ${a}`)
      return [m[1], valueOf(m[2], params)] as const
    })

  const query = async (sql: string, params: unknown[] = []) => {
    const q = sql.replace(/\s+/g, ' ').trim()
    log.push(q)

    const create = q.match(/^CREATE TABLE IF NOT EXISTS (\w+) \((.*)\)$/)
    if (create) {
      const cols = new Set<string>()
      for (const part of splitTop(create[2])) {
        const first = part.split(' ')[0]
        if (!/^(PRIMARY|UNIQUE|CONSTRAINT|FOREIGN|CHECK)$/i.test(first))
          cols.add(first)
      }
      if (!schema.has(create[1])) schema.set(create[1], cols)
      return { rows: [] }
    }
    const addCol = q.match(/^ALTER TABLE (\w+) ADD COLUMN IF NOT EXISTS (\w+)/)
    if (addCol) {
      if (!schema.has(addCol[1]))
        throw new Error(`relation "${addCol[1]}" does not exist`)
      schema.get(addCol[1])!.add(addCol[2])
      return { rows: [] }
    }
    const index = q.match(
      /^CREATE UNIQUE INDEX IF NOT EXISTS \w+ ON (\w+) \(([^)]*)\)$/
    )
    if (index) {
      for (const c of index[2].split(',').map(s => s.trim()))
        if (!schema.get(index[1])?.has(c))
          throw new Error(`column "${c}" does not exist`)
      return { rows: [] }
    }
    if (/^SELECT 1 FROM pg_constraint/.test(q)) return { rows: [] }

    checkColumns(q)

    const insert = q.match(
      /^INSERT INTO (\w+) \(([^)]*)\) VALUES \((.*?)\)(?: ON CONFLICT \(([^)]*)\) DO UPDATE SET (.*?))?(?: RETURNING (\w+))?$/
    )
    if (insert) {
      const [, t, colList, valList, keyList, set, ret] = insert
      const rows = rowsOf(t)
      const cols = colList.split(',').map(s => s.trim())
      const vals = splitTop(valList).map(v => valueOf(v, params))
      const row: Row = {}
      cols.forEach((c, i) => (row[c] = vals[i]))
      if (schema.get(t)!.has('id') && row.id == null) row.id = serial++
      const keys = keyList?.split(',').map(s => s.trim())
      const hit = keys && rows.find(r => keys.every(k => r[k] === row[k]))
      if (hit && set) {
        for (const [c, v] of assignments(set, params)) hit[c] = v
        return { rows: ret ? [{ [ret]: hit[ret] }] : [] }
      }
      rows.push(row)
      return { rows: ret ? [{ [ret]: row[ret] }] : [] }
    }
    const select = q.match(
      /^SELECT (.+?) FROM (\w+)(?: WHERE (.+?))?(?: ORDER BY .+?)?(?: LIMIT (\d+))?$/
    )
    if (select) {
      const [, list, t, cond, limit] = select
      const found = rowsOf(t).filter(whereOf(cond, params))
      const picked = limit ? found.slice(0, +limit) : found
      const fields = list.split(',').map(s => s.trim().replace(/::\w+$/, ''))
      return {
        rows: picked.map(r =>
          fields[0] === '1'
            ? { '?column?': 1 }
            : Object.fromEntries(fields.map(f => [f, r[f]]))
        ),
      }
    }
    const update = q.match(/^UPDATE (\w+) SET (.+?) WHERE (.+)$/)
    if (update) {
      const [, t, set, cond] = update
      for (const r of rowsOf(t).filter(whereOf(cond, params)))
        for (const [c, v] of assignments(set, params)) r[c] = v
      return { rows: [] }
    }
    throw new Error(`double cannot run: ${q.slice(0, 80)}`)
  }

  return {
    query,
    log,
    schema,
    rows: (t: string) => tables.get(t) ?? [],
    /** Everything the code wrote, by statement. */
    writes: () => log.filter(q => /^(INSERT|UPDATE|DELETE)/.test(q)),
  }
}

const as = (who: string, pool: ReturnType<typeof strictPool>) =>
  ({ telegramId: who, pool }) as unknown as ToolContext

async function tools() {
  const mod = await import('./src/agent/crm-client-setup-tool')
  const find = (n: string) => mod.CRM_CLIENT_TOOLS.find(t => t.name === n)!
  return {
    mod,
    setup: find('crm_client_setup'),
    profile: find('crm_client_profile'),
    upload: find('crm_client_package_upload'),
  }
}

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('OWNER_TELEGRAM_ID', OWNER)
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('the strict double is not blind', () => {
  it('refuses a table nobody created and a column nobody created', async () => {
    const pool = strictPool()
    await expect(
      pool.query('SELECT client FROM crm_client_packages WHERE owner_id = $1', [
        OWNER,
      ])
    ).rejects.toThrow('relation "crm_client_packages" does not exist')
    const { mod } = await tools()
    await mod.ensurePackageTable(as(OWNER, pool))
    await expect(
      pool.query(
        'SELECT nickname FROM crm_client_packages WHERE owner_id = $1',
        [OWNER]
      )
    ).rejects.toThrow('column "nickname" does not exist')
    expect([...pool.schema.get('crm_client_packages')!].sort()).toEqual(
      [
        'client',
        'owner_id',
        'profile',
        'skills',
        'soul',
        'telegram_id',
        'updated_at',
      ].sort()
    )
  })
})

describe('a package uploaded by the owner installs from the database', () => {
  it('upload, then crm_client_setup installs SOUL, skills, profile and plan from the row', async () => {
    // The client connected her own Telegram: SOUL, skills and plan are hers.
    const pool = strictPool({
      tg_sessions: [{ telegram_id: CLIENT, session: 's' }],
    })
    const { setup, upload } = await tools()

    const stored: any = await upload.handler(
      {
        client: PACKAGE,
        telegram_id: CLIENT,
        profile: PROFILE,
        soul: SOUL,
        skills: SKILLS,
      },
      as(OWNER, pool)
    )
    expect(stored).toMatchObject({
      stored: true,
      client: PACKAGE,
      telegram_id: CLIENT,
      replaced: false,
      soul: true,
      skills: ['Studio: first answer', 'Studio: drafting'],
    })
    const saved = pool.rows('crm_client_packages')
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({
      owner_id: OWNER,
      client: PACKAGE,
      telegram_id: CLIENT,
    })

    const out: any = await setup.handler(
      { client: PACKAGE, telegram_id: CLIENT },
      as(OWNER, pool)
    )
    expect(out.done).toBe(true)
    expect(out.report).toMatchObject({
      client: PACKAGE,
      telegram_id: CLIENT,
      profile_only: false,
      soul: 'created',
      plan: { goal: 'created', items_added: 2 },
    })
    expect(out.report.skills).toEqual([
      { name: 'Studio: first answer', result: 'created' },
      { name: 'Studio: drafting', result: 'created' },
    ])
    // What landed, row by row, under the client's id.
    expect(pool.rows('user_soul')).toEqual([
      expect.objectContaining({ telegram_id: CLIENT, content: SOUL }),
    ])
    expect(
      pool
        .rows('user_skills')
        .map(r => r.name)
        .sort()
    ).toEqual(['Studio: drafting', 'Studio: first answer'])
    const profiles = pool.rows('crm_client_profiles')
    expect(profiles).toHaveLength(1)
    expect(profiles[0]).toMatchObject({
      telegram_id: CLIENT,
      owner_id: OWNER,
      client: PACKAGE,
    })
    expect(JSON.parse(String(profiles[0].profile)).name).toBe('Robin')
    expect(pool.rows('content_plan_items').map(r => r.title)).toEqual([
      'The first firing',
      'The cracked bowl',
    ])
  })

  it('a second upload replaces the first, one row per package', async () => {
    const pool = strictPool()
    const { upload } = await tools()
    const args = { client: PACKAGE, telegram_id: CLIENT, profile: PROFILE }
    await upload.handler(args, as(OWNER, pool))
    const again: any = await upload.handler(
      { ...args, soul: 'second' },
      as(OWNER, pool)
    )
    expect(again).toMatchObject({ stored: true, replaced: true })
    expect(pool.rows('crm_client_packages')).toHaveLength(1)
    expect(pool.rows('crm_client_packages')[0].soul).toBe('second')
  })

  it('a package in neither home is refused by name, and nothing is installed', async () => {
    const pool = strictPool()
    const { setup } = await tools()
    const out: any = await setup.handler(
      { client: 'nobody-here', telegram_id: CLIENT },
      as(OWNER, pool)
    )
    expect(out.done).toBe(false)
    expect(out.reason).toContain('nobody-here')
    expect(out.reason).toContain('crm_client_package_upload')
    expect(pool.writes()).toEqual([])
  })

  it('a package is installed only for the person it names', async () => {
    const pool = strictPool()
    const { setup, upload } = await tools()
    await upload.handler(
      { client: PACKAGE, telegram_id: CLIENT, profile: PROFILE },
      as(OWNER, pool)
    )
    const before = pool.writes().length
    const out: any = await setup.handler(
      { client: PACKAGE, telegram_id: SOMEONE_ELSE },
      as(OWNER, pool)
    )
    expect(out.done).toBe(false)
    expect(out.reason).toContain('другого человека') // cyrillic-ok
    expect(pool.writes().length).toBe(before)
    expect(pool.rows('crm_client_profiles')).toEqual([])
  })

  it('an upload whose profile names somebody else is refused, and nothing is written', async () => {
    const pool = strictPool()
    const { upload } = await tools()
    const out: any = await upload.handler(
      { client: PACKAGE, telegram_id: SOMEONE_ELSE, profile: PROFILE },
      as(OWNER, pool)
    )
    expect(out.stored).toBe(false)
    expect(pool.log).toEqual([])
  })

  it('the bundled example name cannot be shadowed by an upload', async () => {
    const pool = strictPool()
    const { upload } = await tools()
    const out: any = await upload.handler(
      { client: 'example', telegram_id: CLIENT, profile: PROFILE },
      as(OWNER, pool)
    )
    expect(out.stored).toBe(false)
    expect(pool.log).toEqual([])
  })
})

describe('upload is the owner’s', () => {
  it('a non-owner is refused before a single query -- nothing written, not even the table', async () => {
    const pool = strictPool({
      tg_sessions: [{ telegram_id: STRANGER, session: 's' }],
    })
    const { upload } = await tools()
    const args = {
      client: PACKAGE,
      telegram_id: CLIENT,
      profile: PROFILE,
      soul: SOUL,
      skills: SKILLS,
    }
    await expect(upload.handler(args, as(STRANGER, pool))).rejects.toThrow()
    await expect(upload.handler(args, undefined as never)).rejects.toThrow()
    expect(pool.log).toEqual([])
    expect(pool.schema.has('crm_client_packages')).toBe(false)
  })
})

describe('no id, no answer', () => {
  it('crm_client_setup refuses without telegram_id and touches nothing', async () => {
    const pool = strictPool()
    const { setup, mod } = await tools()
    const out: any = await setup.handler({ client: 'example' }, as(OWNER, pool))
    expect(out).toEqual({ done: false, reason: mod.NO_ID_REASON })
    expect(pool.log).toEqual([])
  })

  it('crm_client_setup refuses without a package name and touches nothing', async () => {
    const pool = strictPool()
    const { setup } = await tools()
    const out: any = await setup.handler(
      { telegram_id: CLIENT },
      as(OWNER, pool)
    )
    expect(out.done).toBe(false)
    expect(out.reason).toContain('client')
    expect(pool.log).toEqual([])
  })

  it('crm_client_profile never answers with a profile nobody asked for', async () => {
    // A profile exists; an empty call must still not find it.
    const pool = strictPool({
      crm_client_profiles: [
        {
          telegram_id: CLIENT,
          owner_id: OWNER,
          client: PACKAGE,
          profile: JSON.stringify(PROFILE),
          updated_at: 't',
        },
      ],
    })
    const { profile, mod } = await tools()
    await expect(profile.handler({}, as(OWNER, pool))).rejects.toThrow(
      mod.NO_ID_REASON
    )
    await expect(
      profile.handler({ telegram_id: '  ' }, as(OWNER, pool))
    ).rejects.toThrow(mod.NO_ID_REASON)
    expect(pool.log).toEqual([])
    // Asked explicitly, it answers.
    const asked: any = await profile.handler(
      { telegram_id: CLIENT },
      as(OWNER, pool)
    )
    expect(asked.has_profile).toBe(true)
  })

  it('crm_client_package_upload refuses without telegram_id and touches nothing', async () => {
    const pool = strictPool()
    const { upload } = await tools()
    const out: any = await upload.handler(
      { client: PACKAGE, profile: PROFILE },
      as(OWNER, pool)
    )
    expect(out.stored).toBe(false)
    expect(out.reason).toContain('telegram_id')
    expect(pool.log).toEqual([])
  })

  it('the schemas say the ids are required and name no default person', async () => {
    const { setup, profile, upload } = await tools()
    expect((setup.parameters as any).required).toEqual([
      'client',
      'telegram_id',
    ])
    expect((profile.parameters as any).required).toEqual(['telegram_id'])
    expect((upload.parameters as any).required).toEqual([
      'client',
      'telegram_id',
      'profile',
    ])
    for (const t of [setup, profile, upload])
      expect(JSON.stringify(t)).not.toMatch(/по умолчанию \d{5,}/) // cyrillic-ok
  })
})
