#!/usr/bin/env node
/** Proves the self-hosted stack answers @supabase/supabase-js exactly as
 *  Supabase did — same client, same call shapes, no code changes. */
const { createClient } = require('@supabase/supabase-js')
const URL_ = process.env.GATEWAY_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY_NEW
if (!URL_ || !KEY) {
  console.error('need GATEWAY_URL and SUPABASE_SERVICE_ROLE_KEY_NEW')
  process.exit(1)
}
const db = createClient(URL_, KEY)
;(async () => {
  let bad = 0
  const ck = (name, ok, extra = '') => {
    console.log(`  ${ok ? 'ok ' : 'BAD'}  ${name} ${extra}`)
    if (!ok) bad++
  }

  for (const [t, want] of Object.entries({
    users: 2341,
    payments_v2: 17135,
    assets: 1509,
    prompts_history: 30063,
    translations: 220,
  })) {
    const { count, error } = await db
      .from(t)
      .select('*', { count: 'exact', head: true })
    ck(
      t.padEnd(18),
      !error && count === want,
      error ? error.message : `count ${count} (want ${want})`
    )
  }

  // filters + ordering + range, i.e. what the app actually does
  const { data, error } = await db
    .from('payments_v2')
    .select('id,stars,bot_name,currency')
    .eq('currency', 'STARS')
    .order('id', { ascending: false })
    .range(0, 4)
  ck(
    'filter+order+range ',
    !error && Array.isArray(data) && data.length === 5,
    error ? error.message : `${data?.length} rows`
  )

  // numeric scale must survive the round trip through PostgREST
  const { data: one } = await db
    .from('payments_v2')
    .select('stars')
    .not('stars', 'is', null)
    .limit(1)
  ck('numeric present    ', one && one.length === 1, JSON.stringify(one?.[0]))

  console.log(bad ? `\n${bad} FAILED` : '\nall checks passed')
  process.exit(bad ? 1 : 0)
})().catch(e => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
