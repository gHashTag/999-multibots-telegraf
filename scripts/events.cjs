#!/usr/bin/env node
/**
 * THE DARK SEGMENT OF THE FUNNEL.
 *
 * `payments_v2` knows about invoices and charges. `prompts_history` knows about
 * generations. Between "somebody arrived" and "somebody paid" there was nothing
 * -- and that is where almost everyone stops: 2380 people have registered and
 * 354 have ever generated anything.
 *
 * The steps recorded are a closed list (src/services/trackEvent.ts): start,
 * menu_shown, topup_opened, refused_no_balance, unanswered_message,
 * unanswered_press, and the club's four: club_card_shown,
 * club_invoice_created, club_paid, club_invoice_abandoned.
 *
 *   railway run -s 999-multibots-telegraf node scripts/events.cjs
 *
 * Read-only.
 *
 * WHERE THE ROWS ARE. The render Postgres (TOKENS_DATABASE_URL), next to the
 * live wallet -- not cloud Supabase, where the table never existed and every
 * write since 2026-09-08 was dropped (measured 2026-09-22).
 *
 * THE DISTINCTION THIS FILE EXISTS TO MAKE. "No events" has two causes that
 * look identical and mean opposite things: nobody used the bot, or nothing was
 * ever written. A funnel of zeros printed for the second reason is exactly the
 * silence that let a payment defect live for nine months. So a missing table
 * is reported as a missing table, and the exit code says which one happened.
 */
const { Client } = require('pg')

/*
 * TWO MODES, TWO TABLES.
 *
 *   node scripts/events.cjs        -- the funnel of steps (user_events)
 *   node scripts/events.cjs heat   -- the scene heat map (client_events)
 *
 * The heat mode answers the owner's question -- "where do clients stop?" --
 * from the scene-move telemetry: one row per scene TRANSITION, not per
 * message. "Stuck" is where a person's LAST transition landed, which is a
 * question about ends, not about volume: a scene with many entries and many
 * people ending in it is the wall.
 *
 * An empty client_events is NOT "nobody used the bot" and must not print as
 * one. From 2026-09-20 to 2026-10-12 the table was empty for a registration
 * reason: the middleware ran only in src/bot.ts, a parity file production
 * does not start (fixed by registering it in src/index.ts; the guard is
 * src/__tests__/telemetry/bothEntrypointsRecordSceneMoves.test.ts). So the
 * empty case says that, in those words.
 */
const MODE = process.argv[2] === 'heat' ? 'heat' : 'funnel'

const url =
  process.env.TOKENS_DATABASE_URL || process.env.RENDER_DATABASE_URL || ''

if (!url) {
  console.error('NO CREDENTIALS in this environment (TOKENS_DATABASE_URL).')
  console.error(
    `Refusing to print an empty ${MODE}, which would be indistinguishable`
  )
  console.error(
    `from a real one. Run: railway run -s 999-multibots-telegraf node scripts/events.cjs${MODE === 'heat' ? ' heat' : ''}`
  )
  process.exit(2)
}

/** THE SCENE HEAT MAP. Read from client_events; exit codes speak, like the funnel. */
async function heat(db) {
  const probe = await db
    .query("SELECT to_regclass('public.client_events') AS t")
    .catch(e => ({ error: e }))
  if (probe.error) {
    console.error(
      `cannot read client_events: ${String(probe.error.message).slice(0, 100)}`
    )
    process.exit(2)
  }
  if (!probe.rows[0].t) {
    console.error('THE TABLE IS NOT THERE — nothing has ever been written.')
    process.exit(3)
  }
  const total = await db.query('SELECT count(*)::int AS n FROM client_events')
  const n = total.rows[0].n
  if (typeof n !== 'number') {
    console.error(`the count came back as ${String(n)}, not a number`)
    process.exit(2)
  }
  console.log(`client_events rows: ${n}`)
  if (n === 0) {
    console.log('')
    console.log('The table exists and is empty. If the bot has been running,')
    console.log('that is the registration gap of 2026-09-20..2026-10-12, not')
    console.log(
      '"nobody used the bot": scene moves need the telemetry middleware'
    )
    console.log(
      'in src/index.ts (see bothEntrypointsRecordSceneMoves.test.ts).'
    )
    process.exit(0)
  }

  for (const days of [1, 7, 30]) {
    console.log('')
    console.log(
      `LAST ${String(days).padStart(2)} DAY(S) — STUCK (last scene per person)`
    )
    const stuck = await db.query(
      `WITH last_move AS (
         SELECT DISTINCT ON (telegram_id) telegram_id, to_scene
           FROM client_events
          WHERE created_at >= now() - ($1 || ' days')::interval
          ORDER BY telegram_id, created_at DESC
       )
       SELECT to_scene, count(*)::int AS people
         FROM last_move GROUP BY to_scene
        ORDER BY people DESC, to_scene LIMIT 15`,
      [String(days)]
    )
    if (!stuck.rows.length) console.log('  (no moves in this window)')
    for (const r of stuck.rows)
      console.log(
        `  ${String(r.people).padStart(5)}  ${r.to_scene || '(left the scenes)'}`
      )

    console.log(`ENTERED (distinct people · moves)`)
    const entered = await db.query(
      `SELECT to_scene,
              count(DISTINCT telegram_id)::int AS people,
              count(*)::int AS moves
         FROM client_events
        WHERE created_at >= now() - ($1 || ' days')::interval
          AND to_scene IS NOT NULL
        GROUP BY to_scene ORDER BY people DESC, to_scene LIMIT 15`,
      [String(days)]
    )
    if (!entered.rows.length) console.log('  (no moves in this window)')
    for (const r of entered.rows)
      console.log(
        `  ${String(r.people).padStart(5)} · ${String(r.moves).padStart(6)}  ${r.to_scene}`
      )
  }
  await db.end()
}

const STEPS = [
  'start',
  'menu_shown',
  'topup_opened',
  'refused_no_balance',
  'unanswered_message',
  'unanswered_press',
  'club_card_shown',
  'club_invoice_created',
  'club_paid',
  'club_invoice_abandoned',
  'agent_package_paid',
]

;(async () => {
  const db = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  })
  await db.connect()
  // Read-only by construction, not by promise.
  await db.query('SET default_transaction_read_only = on')

  if (MODE === 'heat') return heat(db)

  const probe = await db
    .query("SELECT to_regclass('public.user_events') AS t")
    .catch(e => ({ error: e }))
  if (probe.error) {
    console.error(
      `cannot read user_events: ${String(probe.error.message).slice(0, 100)}`
    )
    process.exit(2)
  }
  if (!probe.rows[0].t) {
    console.error('THE TABLE IS NOT THERE — nothing has ever been written.')
    console.error('')
    console.error(
      'src/services/trackEvent.ts creates it on the first recorded step. If the'
    )
    console.error(
      'bot has been running and it is still missing, every write is failing:'
    )
    console.error('look for "[track] event not recorded" in the bot log.')
    console.error('')
    console.error(
      'This is not "nobody used the bot". Those two look identical as a'
    )
    console.error(
      'screen of zeros and mean opposite things, so this refuses to print one.'
    )
    process.exit(3)
  }

  const total = await db.query('SELECT count(*)::int AS n FROM user_events')
  const n = total.rows[0].n
  /*
   * "Did I get a number", not "was there an error": a count that comes back as
   * anything else is a refusal, not data (the Supabase version of this reader
   * printed a column of nulls on its first production run).
   */
  if (typeof n !== 'number') {
    console.error(`the count came back as ${String(n)}, not a number`)
    process.exit(2)
  }
  console.log(`user_events rows: ${n}`)
  if (n === 0) {
    console.log('')
    console.log('The table exists and is empty. If the bot has been running,')
    console.log('that is itself the finding.')
    process.exit(0)
  }

  for (const days of [1, 7, 30]) {
    console.log('')
    console.log(`LAST ${String(days).padStart(2)} DAY(S)`)
    const r = await db.query(
      `SELECT event, count(*)::int AS n, count(DISTINCT telegram_id)::int AS people
         FROM user_events
        WHERE created_at >= now() - ($1 || ' days')::interval
        GROUP BY event`,
      [String(days)]
    )
    const by = new Map(r.rows.map(x => [x.event, x]))
    for (const step of STEPS) {
      const row = by.get(step)
      console.log(
        `  ${step.padEnd(24)} ${String(row ? row.n : 0).padStart(6)}   people ${String(row ? row.people : 0).padStart(5)}`
      )
    }
  }
  await db.end()
})().catch(e => {
  console.error(
    `cannot read user_events: ${String(e && e.message).slice(0, 100)}`
  )
  process.exit(2)
})
