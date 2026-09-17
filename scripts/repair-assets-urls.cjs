#!/usr/bin/env node
/**
 * Чинит строки `assets`, в которые из-за перепутанных аргументов попал
 * служебный id вместо ссылки.
 *
 * Симптом (подтверждён в проде):
 *   public_url   = "kling_lipsync_1755229300876_144022504"
 *   storage_path = "https://replicate.delivery/.../out.mp4"
 *
 * Такие строки чинятся переносом ссылки в public_url. Строки, где ссылки нет
 * ни там ни там, восстановить нечем — они только пересчитываются.
 *
 *   railway run --service <id> -- node scripts/repair-assets-urls.cjs         # dry-run
 *   railway run --service <id> -- node scripts/repair-assets-urls.cjs --apply # запись
 */
const { createClient } = require('@supabase/supabase-js')

const url = process.env.SUPABASE_URL
const key =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const db = createClient(url, key)
const isUrl = v => typeof v === 'string' && /^https?:\/\//.test(v)

async function main() {
  console.log(
    APPLY ? '=== APPLY (записываю) ===' : '=== DRY RUN (ничего не пишу) ==='
  )

  const PAGE = 1000
  let from = 0
  const repairable = []
  const lost = []

  // Постранично, чтобы не полагаться на дефолтный лимит PostgREST.
  for (;;) {
    const { data, error } = await db
      .from('assets')
      .select('id, type, public_url, storage_path, created_at')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) {
      console.error('SELECT failed:', error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break

    for (const r of data) {
      if (isUrl(r.public_url)) continue
      if (isUrl(r.storage_path)) repairable.push(r)
      else lost.push(r)
    }

    if (data.length < PAGE) break
    from += PAGE
  }

  console.log('строк с восстановимой ссылкой :', repairable.length)
  console.log('строк без ссылки вообще       :', lost.length)

  if (repairable.length) {
    const r = repairable[0]
    console.log('\nпример:')
    console.log('  id           :', r.id)
    console.log('  public_url   :', JSON.stringify(r.public_url))
    console.log('  storage_path :', JSON.stringify(r.storage_path))
    console.log('  -> public_url станет', JSON.stringify(r.storage_path))
  }

  if (!APPLY) {
    console.log('\nПовторите с --apply, чтобы записать.')
    return
  }

  let ok = 0
  let failed = 0
  for (const r of repairable) {
    // storage_path очищается: там лежала ссылка, а не путь в нашем хранилище,
    // и оставлять её дублем значило бы сохранить ту же неоднозначность.
    // Пустая строка, а не null: колонка NOT NULL (код 23502).
    const { error } = await db
      .from('assets')
      .update({ public_url: r.storage_path, storage_path: '' })
      .eq('id', r.id)

    if (error) {
      failed++
      console.error('id', r.id, 'не обновлена:', error.message)
    } else {
      ok++
    }
  }

  console.log('\nобновлено:', ok, ' ошибок:', failed)
  console.log('невосстановимых оставлено как есть:', lost.length)
}

main().catch(e => {
  console.error(e.message)
  process.exit(1)
})
