#!/usr/bin/env node
/**
 * Read-only probe of the `assets` table: columns, NULL counts, and which
 * columns actually reject NULL.
 *
 * There is no migration or generated type for this table anywhere in the repo,
 * so its constraints are only knowable by asking the database. Run before
 * changing the writers.
 *
 *   railway run --service <bot-service-id> -- node scripts/probe-assets-schema.cjs
 *
 * Prints no secrets. Writes nothing: the NOT NULL check inserts inside a row
 * that is deleted immediately, and only when --probe-constraints is passed.
 */
const { createClient } = require('@supabase/supabase-js')

const url = process.env.SUPABASE_URL
const key =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const db = createClient(url, key)

async function main() {
  const { data: sample, error } = await db.from('assets').select('*').limit(1)
  if (error) {
    console.error('SELECT failed:', error.message)
    process.exit(1)
  }
  if (!sample?.length) {
    console.log('assets: empty')
    return
  }

  const cols = Object.keys(sample[0])
  console.log('COLUMNS:', cols.join(', '))

  const { count: total } = await db
    .from('assets')
    .select('*', { count: 'exact', head: true })
  console.log('ROWS:', total, '\n')

  // A column with zero NULLs may still be nullable; a column with any NULL is
  // definitely nullable. That asymmetry is why the insert probe below exists.
  for (const c of cols) {
    const { count } = await db
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .is(c, null)
    console.log(
      `${c.padEnd(14)} NULLs: ${String(count).padStart(5)}  ${
        count > 0 ? '=> nullable' : ''
      }`
    )
  }

  if (!process.argv.includes('--probe-constraints')) {
    console.log('\nPass --probe-constraints to test NOT NULL by trial insert.')
    return
  }

  console.log('\n--- NOT NULL probe (inserts a row, then deletes it) ---')
  const base = {
    type: '__probe__',
    trigger_word: 'video',
    telegram_id: '0',
    storage_path: '',
    public_url: 'https://example.invalid/probe.mp4',
    text: '',
    bot_name: '',
  }

  for (const c of [
    'storage_path',
    'text',
    'bot_name',
    'trigger_word',
    'type',
  ]) {
    const row = { ...base, [c]: null }
    const { data, error: e } = await db.from('assets').insert(row).select('id')
    if (e) {
      console.log(`${c.padEnd(14)} NULL rejected -> NOT NULL (${e.code})`)
    } else {
      console.log(`${c.padEnd(14)} NULL accepted -> nullable`)
      await db.from('assets').delete().eq('id', data[0].id)
    }
  }

  // Belt and braces: nothing named __probe__ may survive.
  const { count: leftovers } = await db
    .from('assets')
    .select('*', { count: 'exact', head: true })
    .eq('type', '__probe__')
  console.log('probe rows left behind:', leftovers)
  if (leftovers) await db.from('assets').delete().eq('type', '__probe__')
}

main().catch(e => {
  console.error(e.message)
  process.exit(1)
})
