/**
 * QUEEN-WATCH: THE DATABASE SCHEMA AGAINST ITS BASELINE, ONCE A DAY.
 *
 * 2026-10-07: the Supabase -> Railway copy of 2026-10-01 had silently lost 14
 * unique indexes and several column defaults (gen_random_uuid(), now(), 0).
 * Nothing failed until a person did: "there is no unique or exclusion
 * constraint matching the ON CONFLICT specification". Everything was restored
 * by hand that day. This file makes the next loss the watch's finding, not a
 * user's.
 *
 * The source of truth is NOT the cloud Supabase (a frozen archive since the
 * cutover) but `schema-baseline.json` next to this file: a snapshot of the
 * repaired Postgres-NFrq, written by this file and never by hand:
 *
 *   tri schema-drift              diff the live database against the baseline
 *   tri schema-drift --baseline   rewrite the baseline from the live database
 *
 * What is compared, for every table of schema `public` except SCHEMA_EXEMPT:
 *   - every unique index, by its SHAPE (method, columns, predicate), not its
 *     name: an index restored by hand under another name is the same
 *     constraint as far as ON CONFLICT is concerned;
 *   - every column's default and NOT NULL;
 *   - a primary key, for tables the baseline has never seen too.
 * A new table, index, column or default is a note (the baseline is behind),
 * not drift: only a LOSS breaks a writer.
 *
 * Read-only by construction: one connection with default_transaction_read_only
 * and a short statement_timeout, three catalogue SELECTs, closed. It never
 * writes DDL -- a restored index is a person's decision, the watch only says
 * which one is missing.
 *
 * `pg` is this service's one npm dependency (watch.mjs explains why it had
 * none before): the wire protocol with SCRAM is not something to hand-roll
 * for a daily check. It is imported lazily, so the other watches and every
 * test run without it.
 */
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/*
 * Tables not compared. payments_v2 is the archive of the old wallet
 * (CLAUDE.md, one wallet): nothing writes it, and its metadata default was
 * left as the copy brought it on purpose (2026-10-07).
 */
export const SCHEMA_EXEMPT = ['payments_v2']
/*
 * And the copies taken by hand around the cutover (`users_split_stubs_20261001`,
 * `payments_v2_backup`, `..._backup_20261002`): archives with no primary key
 * by design, dropped when nobody needs them -- neither is drift.
 */
export const SCHEMA_EXEMPT_PATTERN = /(_backup|_pre_cutover|_stubs)(_\d{8})?$/
export const isExempt = (name, exempt = SCHEMA_EXEMPT) =>
  exempt.includes(name) || SCHEMA_EXEMPT_PATTERN.test(name)
/* Once a day: the queen-watch cron is hourly, the schema moves by deploys. */
export const SCHEMA_EVERY_S = 86400
/* A catalogue read takes milliseconds; anything longer is a sick database. */
export const STATEMENT_TIMEOUT_MS = 10000
export const BASELINE_FILE = new URL('./schema-baseline.json', import.meta.url)

export const SQL = {
  columns: `SELECT c.table_name, c.column_name, c.column_default, c.is_nullable
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'`,
  unique: `SELECT tablename, indexname, indexdef
      FROM pg_indexes
     WHERE schemaname = 'public' AND indexdef LIKE 'CREATE UNIQUE INDEX %'`,
  pk: `SELECT c.relname AS table_name,
           EXISTS (SELECT 1 FROM pg_constraint k
                    WHERE k.conrelid = c.oid AND k.contype = 'p') AS has_pk
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')`,
}

/** `CREATE UNIQUE INDEX x ON public.t USING btree (a)` -> `btree (a)`. */
export function uniqueShape(indexdef) {
  return String(indexdef)
    .replace(/^CREATE UNIQUE INDEX (?:"[^"]+"|\S+) ON (?:ONLY )?\S+ USING /, '')
    .trim()
}

const sorted = obj =>
  Object.fromEntries(
    Object.keys(obj)
      .sort()
      .map(k => [k, obj[k]])
  )

/**
 * The three queries' rows -> { tables: { t: { pk, unique: { shape: name },
 * columns: { c: { default, not_null } } } } }, exempt tables left out, keys
 * sorted so a rewritten baseline diffs only where the database moved.
 */
export function snapshot(r, exempt = SCHEMA_EXEMPT) {
  const tables = {}
  const t = name =>
    isExempt(name, exempt)
      ? null
      : (tables[name] ||= { pk: false, unique: {}, columns: {} })
  for (const c of r.columns || []) {
    const x = t(c.table_name)
    if (x)
      x.columns[c.column_name] = {
        default: c.column_default ?? null,
        not_null: c.is_nullable === 'NO',
      }
  }
  for (const u of r.unique || []) {
    const x = t(u.tablename)
    if (x) x.unique[uniqueShape(u.indexdef)] = u.indexname
  }
  for (const p of r.pk || []) {
    const x = t(p.table_name)
    if (x) x.pk = p.has_pk === true || p.has_pk === 't'
  }
  for (const name of Object.keys(tables)) {
    tables[name].unique = sorted(tables[name].unique)
    tables[name].columns = sorted(tables[name].columns)
  }
  return { tables: sorted(tables) }
}

/**
 * Baseline vs live. `drift` is every LOSS (red); `notes` is everything the
 * baseline has not seen yet (refresh it), never red.
 */
export function diffSchema(baseline, live, exempt = SCHEMA_EXEMPT) {
  const drift = []
  const notes = []
  const add = (kind, table, text) => drift.push({ kind, table, text })
  const want = baseline.tables || {}
  const got = live.tables || {}
  for (const [name, b] of Object.entries(want)) {
    if (isExempt(name, exempt)) continue
    const l = got[name]
    if (!l) {
      add('table_missing', name, `${name}: table is gone`)
      continue
    }
    if (b.pk && !l.pk)
      add('pk_missing', name, `${name}: the primary key is gone`)
    for (const [shape, index] of Object.entries(b.unique || {})) {
      if (!(shape in l.unique))
        add(
          'unique_missing',
          name,
          `${name}: unique index ${index} is missing (${shape}) -- ON CONFLICT on it fails`
        )
    }
    for (const [col, bc] of Object.entries(b.columns || {})) {
      const lc = l.columns[col]
      if (!lc) {
        add('column_missing', name, `${name}.${col}: column is gone`)
        continue
      }
      if (bc.default !== null && lc.default === null)
        add(
          'default_missing',
          name,
          `${name}.${col}: default ${bc.default} is missing`
        )
      else if (bc.default !== null && lc.default !== bc.default)
        add(
          'default_changed',
          name,
          `${name}.${col}: default changed: ${bc.default} -> ${lc.default}`
        )
      if (bc.not_null && !lc.not_null)
        add('not_null_lost', name, `${name}.${col}: NOT NULL is missing`)
    }
    const newer = [
      ...Object.keys(l.unique).filter(s => !(s in (b.unique || {}))),
      ...Object.keys(l.columns).filter(c => !(c in (b.columns || {}))),
    ].length
    if (newer) notes.push(`${name}: ${newer} new index(es) or column(s)`)
  }
  for (const [name, l] of Object.entries(got)) {
    if (isExempt(name, exempt) || name in want) continue
    if (!l.pk) add('no_pk', name, `${name}: new table has no primary key`)
    else notes.push(`${name}: new table, not in the baseline`)
  }
  return { drift, notes }
}

const count = (tables, f) => Object.values(tables).reduce((n, t) => n + f(t), 0)

/**
 * One measurement, in watch.mjs's shape: { rc, lines: [{ mark, text }] }.
 * rc 0 = clean, 1 = drift, 2 = not measured (no baseline, no answer, or an
 * empty answer -- an empty catalogue is a wrong database, never "clean").
 */
export async function checkSchema({ baseline, query }) {
  const no = text => ({ rc: 2, lines: [{ mark: '??', text }] })
  if (!baseline || !baseline.tables || !Object.keys(baseline.tables).length)
    return no('schema: no baseline -- run tri schema-drift --baseline')
  let rows
  try {
    rows = await query()
  } catch (e) {
    /* Only the code or the name: a driver message can quote the URL. */
    return no(
      `schema: could not read the database (${(e && (e.code || e.name)) || 'Error'})`
    )
  }
  const live = snapshot(rows)
  if (!Object.keys(live.tables).length)
    return no(
      'schema: the database answered with no tables -- a wrong DATABASE_URL?'
    )
  const { drift, notes } = diffSchema(baseline, live)
  const b = baseline.tables
  const lines = drift.map(d => ({ mark: 'FAIL', text: d.text, kind: d.kind }))
  if (!drift.length)
    lines.push({
      mark: 'ok',
      text: `schema: ${Object.keys(b).length} tables, ${count(b, t => Object.keys(t.unique).length)} unique indexes, ${count(b, t => Object.values(t.columns).filter(c => c.default !== null).length)} defaults match the baseline of ${baseline.generated_at}`,
    })
  if (notes.length)
    lines.push({
      mark: 'note',
      text: `schema: the baseline is behind the database (${notes.length}): ${notes.slice(0, 5).join('; ')}${notes.length > 5 ? '; ...' : ''} -- tri schema-drift --baseline`,
    })
  return { rc: drift.length ? 1 : 0, lines }
}

/**
 * The baseline file's bytes: JSON, one line per column. It is in
 * .prettierignore -- these bytes are the generator's, and a rewrite must diff
 * only where the database moved.
 */
export function renderBaseline(doc) {
  return (
    JSON.stringify(doc, null, 2).replace(
      /\{\n\s+"default": (null|"(?:[^"\\]|\\.)*"),\n\s+"not_null": (true|false)\n\s+\}/g,
      '{ "default": $1, "not_null": $2 }'
    ) + '\n'
  )
}

export async function loadBaseline(file = BASELINE_FILE) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

/*
 * `pg`, from this image's node_modules, or -- for `tri schema-drift` on a
 * checkout where this directory has none -- from PG_RESOLVE_FROM (a directory
 * whose node_modules has it; tri passes the repo root).
 */
function loadPg() {
  const here = createRequire(import.meta.url)
  try {
    return here('pg')
  } catch (e) {
    const from = process.env.PG_RESOLVE_FROM
    if (!from) throw e
    return createRequire(join(from, 'package.json'))('pg')
  }
}

/** The live rows, read-only, one connection, closed whatever happens. */
export async function readLive(url) {
  const pg = loadPg()
  const internal = /\.railway\.internal[:/]/.test(url)
  const client = new pg.Client({
    connectionString: url,
    ssl: internal ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    query_timeout: STATEMENT_TIMEOUT_MS + 2000,
    application_name: 'queen-watch-schema',
    options: '-c default_transaction_read_only=on',
  })
  /* A driver error event after a failed query must not crash the cron. */
  client.on('error', () => {})
  await client.connect()
  try {
    const out = {}
    for (const [k, sql] of Object.entries(SQL))
      out[k] = (await client.query(sql)).rows
    return out
  } finally {
    await client.end().catch(() => {})
  }
}

/*
 * CLI: `node schema.mjs check` / `node schema.mjs baseline`, DATABASE_URL from
 * the environment (tri schema-drift reads it from Railway and never prints
 * it). Exit codes as checkSchema.
 */
/* realpath: /tmp is a symlink on macOS, and import.meta.url is resolved. */
const argvUrl = () => {
  try {
    return pathToFileURL(realpathSync(process.argv[1] || '')).href
  } catch {
    return ''
  }
}
if (import.meta.url === argvUrl()) {
  const url = process.env.DATABASE_URL || ''
  const mode = process.argv[2] || 'check'
  const say = s =>
    process.stdout.write(
      url ? s.split(url).join('[redacted]') + '\n' : s + '\n'
    )
  if (!url) {
    say('schema: no DATABASE_URL -- not measured')
    process.exit(2)
  }
  if (mode === 'baseline') {
    try {
      const rows = await readLive(url)
      const snap = snapshot(rows)
      const n = Object.keys(snap.tables).length
      if (!n) {
        say(
          'schema: the database answered with no tables -- baseline NOT written'
        )
        process.exit(2)
      }
      const doc = {
        about:
          'Tool-written by deployment/queen-watch/schema.mjs (tri schema-drift --baseline) from Postgres-NFrq. Do not edit by hand.',
        generated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
        exempt_note: `not compared: ${SCHEMA_EXEMPT.join(', ')} and ${SCHEMA_EXEMPT_PATTERN} (schema.mjs)`,
        ...snap,
      }
      await writeFile(BASELINE_FILE, renderBaseline(doc))
      say(`schema: baseline written, ${n} tables`)
      process.exit(0)
    } catch (e) {
      say(
        `schema: could not read the database (${(e && (e.code || e.name)) || 'Error'})`
      )
      process.exit(2)
    }
  }
  const r = await checkSchema({
    baseline: await loadBaseline(),
    query: () => readLive(url),
  })
  for (const l of r.lines) say(`  ${l.mark.padEnd(4)}  ${l.text}`)
  process.exit(r.rc)
}
