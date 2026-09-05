const { createClient } = require('@supabase/supabase-js')
const url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY
const db = createClient(url, key)
// What the walk could NOT see is recorded, not dropped. Two paths used to end
// the walk in silence, and this probe reconciles "referenced in the database"
// against "present in storage" -- so anything unseen is reported as MISSING,
// which is a wrong answer rather than a smaller one.
//
//   d > 8            deeper folders were skipped without a word
//   error||!length   a LISTING ERROR was treated exactly like an empty folder
//
// probe-storage-inventory, walking the same buckets, already records both
// (acc.errors and truncated=) and prints them beside its numbers.
const blind = { deep: [], errors: [] }

async function walk(b, p, acc, d) {
  if (d > 8) {
    blind.deep.push(`${b}/${p}`)
    return
  }
  let o = 0
  for (;;) {
    const { data, error } = await db.storage
      .from(b)
      .list(p, { limit: 100, offset: o })
    if (error) {
      blind.errors.push(`${b}/${p}: ${error.message}`)
      return
    }
    if (!data?.length) return
    for (const e of data) {
      const path = p ? `${p}/${e.name}` : e.name
      if (e.id === null || !e.metadata) await walk(b, path, acc, d + 1)
      else acc.set(path, Number(e.metadata.size || 0))
    }
    if (data.length < 100) return
    o += data.length
  }
}
async function main() {
  const { data: tr } = await db
    .from('translations')
    .select('id,bot_name,key,url')
    .like('url', '%/storage/v1/object/%')
  const byBucket = {}
  for (const r of tr) {
    const b = (r.url.split('/object/public/')[1] || '?').split('/')[0]
    byBucket[b] = (byBucket[b] || 0) + 1
  }
  console.log(
    'translations.url count:',
    tr.length,
    'per bucket:',
    JSON.stringify(byBucket)
  )
  console.log('samples:')
  tr.slice(0, 6).forEach(r =>
    console.log('  ', r.bot_name, '|', r.key, '|', r.url)
  )

  console.log(
    '\n=== RECONCILIATION: DB-referenced keys vs objects present, per bucket ==='
  )
  if (blind.deep.length || blind.errors.length) {
    console.log(
      `  ОСМОТР НЕПОЛОН: не пройдено вглубь ${blind.deep.length}, ошибок листинга ${blind.errors.length}`
    )
    for (const x of [...blind.errors, ...blind.deep].slice(0, 5))
      console.log('     ' + x)
    console.log(
      '  вывод ниже занижает присутствующее и завышает «отсутствует».'
    )
  }
  const inv = {}
  for (const b of [
    'images',
    'landingpage',
    'ai-training',
    'dev',
    'leelachakra',
    'sync-labs',
  ]) {
    const m = new Map()
    await walk(b, '', m, 0)
    inv[b] = m
  }

  const refs = {} // bucket -> Map(key -> [sources])
  const add = (u, src) => {
    const t = u.split('/object/public/')[1]
    if (!t) return
    const i = t.indexOf('/')
    const b = t.slice(0, i),
      k = decodeURIComponent(t.slice(i + 1))
    refs[b] = refs[b] || new Map()
    if (!refs[b].has(k)) refs[b].set(k, new Set())
    refs[b].get(k).add(src)
  }
  for (const [t, c] of [
    ['users', 'photo_url'],
    ['avatars', 'avatar_url'],
    ['model_trainings', 'zip_url'],
    ['translations', 'url'],
  ]) {
    let from = 0
    for (;;) {
      const { data, error } = await db
        .from(t)
        .select(c)
        .like(c, '%/object/public/%')
        .range(from, from + 999)
      if (error || !data?.length) break
      for (const r of data) add(r[c], `${t}.${c}`)
      if (data.length < 1000) break
      from += 1000
    }
  }

  let grandRefBytes = 0
  for (const b of Object.keys(refs)) {
    const present = inv[b] || new Map()
    let hit = 0,
      miss = 0,
      bytes = 0
    for (const [k, srcs] of refs[b]) {
      if (present.has(k)) {
        hit++
        bytes += present.get(k)
      } else miss++
      void srcs
    }
    grandRefBytes += bytes
    console.log(
      `  ${b}: ${refs[b].size} distinct keys referenced -> ${hit} PRESENT (${(bytes / 1024 / 1024).toFixed(1)} MB), ${miss} MISSING`
    )
  }
  console.log(
    `  total bytes that must survive a move: ${(grandRefBytes / 1024 / 1024).toFixed(1)} MB`
  )

  console.log(
    '\n=== per bucket: objects present vs referenced (orphan analysis) ==='
  )
  let tot = 0,
    totB = 0
  for (const b of Object.keys(inv)) {
    const present = inv[b],
      r = refs[b] || new Map()
    let refd = 0,
      orph = 0,
      orphB = 0,
      refB = 0
    for (const [k, s] of present) {
      if (r.has(k)) {
        refd++
        refB += s
      } else {
        orph++
        orphB += s
      }
    }
    let sum = 0
    for (const s of present.values()) sum += s
    tot += present.size
    totB += sum
    console.log(
      `  ${b}: ${present.size} objects / ${(sum / 1024 / 1024).toFixed(1)} MB  |  referenced-by-DB ${refd} (${(refB / 1024 / 1024).toFixed(1)} MB)  |  unreferenced ${orph} (${(orphB / 1024 / 1024).toFixed(1)} MB)`
    )
  }
  console.log(`  TOTAL: ${tot} objects, ${(totB / 1024 / 1024).toFixed(1)} MB`)
}
main().catch(e => {
  console.error(e)
  process.exit(1)
})
