const { createClient } = require('@supabase/supabase-js')
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY // the REAL one
const db = createClient(url, key)
function claims(j) {
  try {
    return JSON.parse(Buffer.from(j.split('.')[1], 'base64').toString())
  } catch {
    return null
  }
}
const mb = b => (b / 1024 / 1024).toFixed(1) + ' MB'

async function walk(bucket, prefix, acc, depth) {
  if (depth > 8) {
    acc.truncated = true
    return
  }
  let offset = 0
  for (;;) {
    const { data, error } = await db.storage
      .from(bucket)
      .list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
    if (error) {
      acc.errors.push(`${prefix || '/'}: ${error.message}`)
      return
    }
    if (!data || !data.length) return
    for (const e of data) {
      const path = prefix ? `${prefix}/${e.name}` : e.name
      if (e.id === null || !e.metadata) {
        acc.folders++
        await walk(bucket, path, acc, depth + 1)
      } else {
        acc.objects++
        acc.bytes += Number(e.metadata.size || 0)
        const ext = (e.name.split('.').pop() || 'none').toLowerCase()
        acc.ext[ext] = (acc.ext[ext] || 0) + 1
        if (acc.samples.length < 6)
          acc.samples.push(
            `${path}  [${e.metadata.size}b ${e.metadata.mimetype}]`
          )
        const top = path.includes('/') ? path.split('/')[0] : '(root)'
        acc.top[top] = acc.top[top] || { n: 0, b: 0 }
        acc.top[top].n++
        acc.top[top].b += Number(e.metadata.size || 0)
        acc.keys.push(path)
      }
    }
    if (data.length < 100) return
    offset += data.length
    if (offset > 100000) {
      acc.truncated = true
      return
    }
  }
}
async function main() {
  const c = claims(key)
  console.log(
    'SERVICE_ROLE_KEY role claim:',
    c ? JSON.stringify({ role: c.role, ref: c.ref }) : '(non-JWT)'
  )
  const lb = await db.storage.listBuckets()
  console.log(
    '\n=== listBuckets ===',
    lb.error ? 'ERR ' + lb.error.message : ''
  )
  for (const b of lb.data || [])
    console.log(
      `  ${b.name}  public=${b.public}  sizeLimit=${b.file_size_limit}  mimes=${JSON.stringify(b.allowed_mime_types)}  created=${b.created_at}`
    )
  const names = (lb.data || []).map(b => b.name)
  const grand = { objects: 0, bytes: 0 }
  const inv = {}
  for (const name of names) {
    const acc = {
      objects: 0,
      folders: 0,
      bytes: 0,
      ext: {},
      top: {},
      samples: [],
      errors: [],
      truncated: false,
      keys: [],
    }
    const t0 = Date.now()
    await walk(name, '', acc, 0)
    inv[name] = acc
    grand.objects += acc.objects
    grand.bytes += acc.bytes
    console.log(
      `\n=== BUCKET ${name} === objects=${acc.objects} folders=${acc.folders} size=${mb(acc.bytes)} truncated=${acc.truncated} ${Date.now() - t0}ms`
    )
    if (acc.errors.length) console.log('  errors:', acc.errors.slice(0, 3))
    if (acc.objects) {
      console.log('  ext:', JSON.stringify(acc.ext))
      console.log(
        '  top prefixes:',
        Object.entries(acc.top)
          .sort((a, b) => b[1].n - a[1].n)
          .slice(0, 15)
          .map(([k, v]) => `${k}=${v.n}/${mb(v.b)}`)
          .join('  ')
      )
      console.log('  samples:\n   ', acc.samples.join('\n    '))
      const sizes = acc.keys.length
      console.log(
        '  largest:',
        '(n/a)',
        'avg obj size:',
        mb(acc.bytes / acc.objects),
        'n keys captured:',
        sizes
      )
    }
  }
  console.log(
    `\n=== GRAND TOTAL: ${grand.objects} objects, ${mb(grand.bytes)} across ${names.length} buckets ===`
  )
  const fs = require('fs')
  fs.writeFileSync(
    '/tmp/keys.json',
    JSON.stringify(
      Object.fromEntries(Object.entries(inv).map(([k, v]) => [k, v.keys]))
    )
  )
  console.log('key manifest written to /tmp/keys.json')

  // Do the 993 "dead" landingpage URLs correspond to objects that exist?
  console.log(
    '\n=== cross-check: do DB-referenced landingpage keys exist in the bucket? ==='
  )
  const lpKeys = new Set((inv['landingpage'] || { keys: [] }).keys)
  console.log('  landingpage objects in bucket:', lpKeys.size)
  const refs = new Set()
  let from = 0
  for (;;) {
    const { data, error } = await db
      .from('users')
      .select('photo_url')
      .like('photo_url', '%/object/public/landingpage/%')
      .range(from, from + 999)
    // An error must not read as "no more references": the count printed below
    // would silently understate what is referenced.
    if (error) {
      console.log(
        '  ОШИБКА ЧТЕНИЯ ССЫЛОК:',
        error.message,
        '-- счёт ниже занижен'
      )
      break
    }
    if (!data?.length) break
    for (const r of data)
      refs.add(
        decodeURIComponent(r.photo_url.split('/object/public/landingpage/')[1])
      )
    if (data.length < 1000) break
    from += 1000
  }
  console.log(
    '  distinct landingpage keys referenced by users.photo_url:',
    refs.size
  )
  let hit = 0,
    miss = 0,
    missS = []
  for (const k of refs) {
    if (lpKeys.has(k)) hit++
    else {
      miss++
      if (missS.length < 6) missS.push(k)
    }
  }
  console.log(`  present in bucket: ${hit}   ABSENT: ${miss}`)
  console.log('  absent samples:\n   ', missS.join('\n    '))
}
main().catch(e => {
  console.error('FATAL', e)
  process.exit(1)
})
