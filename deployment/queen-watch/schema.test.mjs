/**
 * queen-watch: the schema drift check (schema.mjs). Every database is a fake:
 * the rows below are what pg_indexes / information_schema / pg_constraint
 * answer, and nothing here opens a connection.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  SCHEMA_EXEMPT,
  checkSchema,
  diffSchema,
  isExempt,
  renderBaseline,
  snapshot,
  uniqueShape,
} from './schema.mjs'

/* The live database as the three queries read it: two tables, one archive. */
function rows() {
  return {
    columns: [
      {
        table_name: 'user_tokens',
        column_name: 'id',
        column_default: 'gen_random_uuid()',
        is_nullable: 'NO',
      },
      {
        table_name: 'user_tokens',
        column_name: 'telegram_id',
        column_default: null,
        is_nullable: 'NO',
      },
      {
        table_name: 'user_tokens',
        column_name: 'balance',
        column_default: '0',
        is_nullable: 'NO',
      },
      {
        table_name: 'user_tokens',
        column_name: 'updated_at',
        column_default: 'now()',
        is_nullable: 'YES',
      },
      {
        table_name: 'crm_touches',
        column_name: 'id',
        column_default: "nextval('crm_touches_id_seq'::regclass)",
        is_nullable: 'NO',
      },
      {
        table_name: 'crm_touches',
        column_name: 'note',
        column_default: null,
        is_nullable: 'YES',
      },
      {
        table_name: 'payments_v2',
        column_name: 'id',
        column_default: null,
        is_nullable: 'NO',
      },
      {
        table_name: 'payments_v2',
        column_name: 'metadata',
        column_default: "'{}'::jsonb",
        is_nullable: 'YES',
      },
    ],
    unique: [
      {
        tablename: 'user_tokens',
        indexname: 'user_tokens_pkey',
        indexdef:
          'CREATE UNIQUE INDEX user_tokens_pkey ON public.user_tokens USING btree (id)',
      },
      {
        tablename: 'user_tokens',
        indexname: 'user_tokens_telegram_id_key',
        indexdef:
          'CREATE UNIQUE INDEX user_tokens_telegram_id_key ON public.user_tokens USING btree (telegram_id)',
      },
      {
        tablename: 'crm_touches',
        indexname: 'crm_touches_pkey',
        indexdef:
          'CREATE UNIQUE INDEX crm_touches_pkey ON public.crm_touches USING btree (id)',
      },
      {
        tablename: 'payments_v2',
        indexname: 'payments_v2_pkey',
        indexdef:
          'CREATE UNIQUE INDEX payments_v2_pkey ON public.payments_v2 USING btree (id)',
      },
      {
        tablename: 'payments_v2',
        indexname: 'payments_v2_inv_key',
        indexdef:
          'CREATE UNIQUE INDEX payments_v2_inv_key ON public.payments_v2 USING btree (inv_id)',
      },
    ],
    pk: [
      { table_name: 'user_tokens', has_pk: true },
      { table_name: 'crm_touches', has_pk: true },
      { table_name: 'payments_v2', has_pk: true },
    ],
  }
}

const baselineOf = r => ({
  generated_at: '2026-10-07T00:00:00Z',
  ...snapshot(r),
})
const drop = (r, key, pred) => ({ ...r, [key]: r[key].filter(x => !pred(x)) })

describe('the schema drift check', () => {
  it('a database equal to its baseline is clean', () => {
    const d = diffSchema(baselineOf(rows()), snapshot(rows()))
    expect(d.drift).toEqual([])
    expect(d.notes).toEqual([])
  })

  it('the archive payments_v2 is exempt: it is not in the baseline at all', () => {
    expect(SCHEMA_EXEMPT).toContain('payments_v2')
    expect(Object.keys(baselineOf(rows()).tables).sort()).toEqual([
      'crm_touches',
      'user_tokens',
    ])
  })

  it('NEGATIVE CONTROL: a dropped unique index is reported, by name and columns', () => {
    const live = snapshot(
      drop(rows(), 'unique', u => u.indexname === 'user_tokens_telegram_id_key')
    )
    const d = diffSchema(baselineOf(rows()), live)
    expect(d.drift.map(x => x.kind)).toEqual(['unique_missing'])
    expect(d.drift[0].text).toBe(
      'user_tokens: unique index user_tokens_telegram_id_key is missing (btree (telegram_id)) -- ON CONFLICT on it fails'
    )
  })

  it('NEGATIVE CONTROL: a dropped column default is reported', () => {
    const r = rows()
    r.columns = r.columns.map(c =>
      c.column_name === 'id' && c.table_name === 'user_tokens'
        ? { ...c, column_default: null }
        : c
    )
    const d = diffSchema(baselineOf(rows()), snapshot(r))
    expect(d.drift.map(x => x.kind)).toEqual(['default_missing'])
    expect(d.drift[0].text).toBe(
      'user_tokens.id: default gen_random_uuid() is missing'
    )
  })

  it('NEGATIVE CONTROL: the exempt archive drifting is not reported', () => {
    const r = drop(rows(), 'unique', u => u.indexname === 'payments_v2_inv_key')
    r.columns = r.columns.map(c =>
      c.table_name === 'payments_v2' ? { ...c, column_default: null } : c
    )
    r.pk = r.pk.map(p =>
      p.table_name === 'payments_v2' ? { ...p, has_pk: false } : p
    )
    const d = diffSchema(baselineOf(rows()), snapshot(r))
    expect(d.drift).toEqual([])
  })

  it('dated cutover copies are exempt too: no primary key there is not drift', () => {
    const r = rows()
    r.columns.push({
      table_name: 'users_split_stubs_20261001',
      column_name: 'x',
      column_default: null,
      is_nullable: 'YES',
    })
    r.pk.push({ table_name: 'users_split_stubs_20261001', has_pk: false })
    expect(diffSchema(baselineOf(rows()), snapshot(r)).drift).toEqual([])
    expect(isExempt('payments_v2_backup')).toBe(true)
    expect(isExempt('crm_client_profiles')).toBe(false)
  })

  it('a changed default, a lost NOT NULL, a lost column and a lost table are drift', () => {
    const r = rows()
    r.columns = r.columns
      .map(c =>
        c.column_name === 'balance' ? { ...c, column_default: '1' } : c
      )
      .map(c =>
        c.column_name === 'telegram_id' ? { ...c, is_nullable: 'YES' } : c
      )
      .filter(c => c.column_name !== 'updated_at')
    const d = diffSchema(baselineOf(rows()), snapshot(r))
    expect(d.drift.map(x => x.kind).sort()).toEqual([
      'column_missing',
      'default_changed',
      'not_null_lost',
    ])
    const gone = snapshot(
      drop(
        drop(
          drop(rows(), 'columns', c => c.table_name === 'crm_touches'),
          'unique',
          u => u.tablename === 'crm_touches'
        ),
        'pk',
        p => p.table_name === 'crm_touches'
      )
    )
    expect(diffSchema(baselineOf(rows()), gone).drift.map(x => x.text)).toEqual(
      ['crm_touches: table is gone']
    )
  })

  it('a new table without a primary key is drift; a new table with one is a note', () => {
    const r = rows()
    r.columns.push(
      {
        table_name: 'loose_rows',
        column_name: 'x',
        column_default: null,
        is_nullable: 'YES',
      },
      {
        table_name: 'fresh_rows',
        column_name: 'id',
        column_default: null,
        is_nullable: 'NO',
      }
    )
    r.pk.push(
      { table_name: 'loose_rows', has_pk: false },
      { table_name: 'fresh_rows', has_pk: true }
    )
    const d = diffSchema(baselineOf(rows()), snapshot(r))
    expect(d.drift.map(x => x.text)).toEqual([
      'loose_rows: new table has no primary key',
    ])
    expect(d.notes).toEqual(['fresh_rows: new table, not in the baseline'])
  })

  it('a unique index renamed by hand is still the same constraint', () => {
    const r = rows()
    r.unique = r.unique.map(u =>
      u.indexname === 'user_tokens_telegram_id_key'
        ? {
            ...u,
            indexname: 'user_tokens_tid_restored',
            indexdef:
              'CREATE UNIQUE INDEX user_tokens_tid_restored ON public.user_tokens USING btree (telegram_id)',
          }
        : u
    )
    expect(diffSchema(baselineOf(rows()), snapshot(r)).drift).toEqual([])
    expect(
      uniqueShape(
        'CREATE UNIQUE INDEX "odd name" ON ONLY public.t USING btree (a, b) WHERE (a IS NOT NULL)'
      )
    ).toBe('btree (a, b) WHERE (a IS NOT NULL)')
  })

  it('checkSchema: clean is rc 0, drift is rc 1 with a FAIL per item, an unreadable database is rc 2', async () => {
    const base = baselineOf(rows())
    const ok = await checkSchema({ baseline: base, query: async () => rows() })
    expect(ok.rc).toBe(0)
    expect(ok.lines.map(l => l.mark)).toEqual(['ok'])
    expect(ok.lines[0].text).toBe(
      'schema: 2 tables, 3 unique indexes, 4 defaults match the baseline of 2026-10-07T00:00:00Z'
    )

    const bad = await checkSchema({
      baseline: base,
      query: async () =>
        drop(
          rows(),
          'unique',
          u => u.indexname === 'user_tokens_telegram_id_key'
        ),
    })
    expect(bad.rc).toBe(1)
    expect(bad.lines.filter(l => l.mark === 'FAIL')).toHaveLength(1)

    const down = await checkSchema({
      baseline: base,
      query: async () => {
        throw Object.assign(
          new Error('connect ECONNREFUSED postgres://u:pw@h/db'),
          { code: 'ECONNREFUSED' }
        )
      },
    })
    expect(down.rc).toBe(2)
    expect(down.lines[0].mark).toBe('??')
    /* Only the code: a driver message can carry the connection string. */
    expect(down.lines[0].text).toBe(
      'schema: could not read the database (ECONNREFUSED)'
    )
  })

  it('an empty read is not measured, never clean', async () => {
    const r = await checkSchema({
      baseline: baselineOf(rows()),
      query: async () => ({ columns: [], unique: [], pk: [] }),
    })
    expect(r.rc).toBe(2)
  })

  it('the baseline file is one line per column and reads back as written', () => {
    const doc = baselineOf(rows())
    const text = renderBaseline(doc)
    expect(JSON.parse(text)).toEqual(doc)
    expect(text).toContain(
      '"id": { "default": "gen_random_uuid()", "not_null": true }'
    )
    expect(text.endsWith('\n')).toBe(true)
  })

  it('the committed baseline is a real one: tables, unique indexes, no exempt table', () => {
    const b = JSON.parse(
      readFileSync(new URL('./schema-baseline.json', import.meta.url), 'utf8')
    )
    const tables = Object.keys(b.tables)
    expect(tables.length).toBeGreaterThan(20)
    for (const t of SCHEMA_EXEMPT) expect(tables).not.toContain(t)
    const uniques = tables.reduce(
      (n, t) => n + Object.keys(b.tables[t].unique).length,
      0
    )
    expect(uniques).toBeGreaterThan(tables.length)
    expect(b.generated_at).toMatch(/^\d{4}-\d\d-\d\dT/)
  })
})
