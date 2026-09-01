#!/usr/bin/env node
// tri single-telegram -- find `.single()` calls on a users query filtered by
// telegram_id, which is NOT unique in this DB.
//
// WHY THIS EXISTS. telegram_id is not unique in `users`: production has ~19
// telegram_ids with 2-3 rows each (measured in updateUserBalance.ts, corroborated
// by scripts/migrate-schema.sql). A supabase `.single()` on a query that filters
// by telegram_id returns a PGRST116 "multiple (or no) rows" error for those
// duplicate-row users, so the reader yields null/error. Depending on the caller
// that ranges from a silent default to a hard abort -- e.g. getUserHelper
// returned null and the whole image-to-video flow aborted those paying users with
// a false "user not found" (fixed iter241 #1599). The correct pattern (used by the
// migrated siblings getUserByTelegramId / updateUserBalance) is
// `.order('updated_at',{ascending:false}).limit(1)` and take the first row.
//
// This is a REPO-WIDE DEBT AUDIT, not a per-fix gate: ~32 sites exist across core
// readers. Migrating them is a coordinated owner change (each caller needs its
// null/default handling re-checked). Use this to track the count down and to catch
// a NEW `.single()`-on-telegram_id before it ships. The one already-fixed file is
// pinned by videoHelperNonUniqueTelegramId.test.ts.
//
// Usage: node .claude/loop-opus/single-telegram-audit.mjs [--self-check]

import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const walk = d =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name)
    if (e.isDirectory())
      return /node_modules|__tests__|\/tests?\b|\.git/.test(p) ? [] : walk(p)
    return /\.tsx?$/.test(p) && !/\.test\.|\.spec\./.test(p) ? [p] : []
  })

// Exported so the self-check can exercise it on a synthetic snippet.
export function singleOnTelegramId(source, fileName = 'x.ts') {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  const hits = []
  const visit = n => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'single'
    ) {
      const chain = n.expression.expression.getText(sf)
      if (/\.eq\(\s*['"]telegram_id['"]/.test(chain)) {
        hits.push(sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1)
      }
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return hits
}

function selfCheck() {
  const bad = `supabase.from('users').select('level').eq('telegram_id', id).single()`
  const good = `supabase.from('users').select('level').eq('telegram_id', id).order('updated_at',{ascending:false}).limit(1)`
  const uniqueKey = `supabase.from('users').select('*').eq('id', uuid).single()`
  const ok =
    singleOnTelegramId(bad).length === 1 &&
    singleOnTelegramId(good).length === 0 &&
    singleOnTelegramId(uniqueKey).length === 0
  console.log(ok ? 'SELF-CHECK OK' : 'SELF-CHECK FAILED')
  process.exit(ok ? 0 : 1)
}

function main() {
  if (process.argv.includes('--self-check')) return selfCheck()
  const root = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '..',
    '..'
  )
  const srcDir = path.join(root, 'src')
  let total = 0
  const byFile = []
  for (const f of walk(srcDir)) {
    const lines = singleOnTelegramId(fs.readFileSync(f, 'utf8'), f)
    if (lines.length) {
      const rel = path.relative(root, f)
      byFile.push({ rel, lines })
      total += lines.length
    }
  }
  byFile.sort((a, b) => a.rel.localeCompare(b.rel))
  for (const { rel, lines } of byFile)
    for (const ln of lines) console.log(`${rel}:${ln}`)
  console.log(
    `\n${total} .single()-on-telegram_id sites in ${byFile.length} files.`
  )
  console.log(
    `telegram_id is NOT unique -> each errors for the ~19 duplicate-row users. ` +
      `Migrate to .order('updated_at',{ascending:false}).limit(1) (owner: coordinated).`
  )
}

main()
