#!/usr/bin/env node
// tri single-telegram -- find `.single()` calls on a users query filtered by
// telegram_id (a non-unique column), split into LIVE vs DEAD.
//
// WHY THIS EXISTS. telegram_id is not unique in `users`: production has ~19
// telegram_ids with 2-3 rows each (measured in updateUserBalance.ts, corroborated
// by scripts/migrate-schema.sql). A supabase `.single()` on a query filtered by
// telegram_id returns a PGRST116 "multiple (or no) rows" error for those
// duplicate-row users, so the reader yields null/error. Depending on the caller
// that ranges from a silent default (getAspectRatio -> 1:1) to a hard abort
// (getUserHelper -> image-to-video aborted, #1599) to compounding the duplication
// (incrementLimit's PGRST116->insert adds ANOTHER row). The correct pattern (used
// by getUserByTelegramId / updateUserBalance) is
// `.order('updated_at',{ascending:false}).limit(1)` + take the first row.
//
// LIVENESS SPLIT. The repo has many DUPLICATE copies of these readers (a hub in
// core/supabase/ai.ts plus standalone files), and a lot of the standalone copies
// are DEAD (never invoked). A flat count badly over-states the real debt -- iter243
// found ~17 of 29 sites were dead. So this classifies each site by whether its
// enclosing function is invoked ANYWHERE in src (pure-AST call-name set; a
// duplicate-named function is conservatively marked live if EITHER copy is called).
// Migrate the LIVE sites; the DEAD ones are dead-code cleanup (owner).
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

/** Enclosing function/const name for a node, or null. */
function enclosingName(node) {
  let c = node
  while (c) {
    if (ts.isFunctionDeclaration(c) && c.name) return c.name.text
    if (ts.isVariableDeclaration(c) && ts.isIdentifier(c.name))
      return c.name.text
    c = c.parent
  }
  return null
}

/** `.single()`-on-telegram_id sites in one source, with enclosing fn name. */
export function sitesIn(source, fileName = 'x.ts') {
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
      n.expression.name.text === 'single' &&
      /\.eq\(\s*['"]telegram_id['"]/.test(n.expression.expression.getText(sf))
    ) {
      hits.push({
        line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
        fn: enclosingName(n),
      })
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return hits
}

/** Set of all function names CALLED in a source (pure AST). */
export function calledNamesIn(source, fileName = 'x.ts') {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  const names = new Set()
  const visit = n => {
    if (ts.isCallExpression(n)) {
      const e = n.expression
      if (ts.isIdentifier(e)) names.add(e.text)
      else if (ts.isPropertyAccessExpression(e)) names.add(e.name.text)
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return names
}

function selfCheck() {
  const bad = `supabase.from('users').select('level').eq('telegram_id', id).single()`
  const good = `supabase.from('users').select('level').eq('telegram_id', id).order('updated_at',{ascending:false}).limit(1)`
  const uniqueKey = `supabase.from('users').select('*').eq('id', uuid).single()`
  const called = calledNamesIn(`foo(); a.bar()`)
  const ok =
    sitesIn(bad).length === 1 &&
    sitesIn(good).length === 0 &&
    sitesIn(uniqueKey).length === 0 &&
    called.has('foo') &&
    called.has('bar') &&
    !called.has('baz')
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
  const files = walk(path.join(root, 'src'))
  const called = new Set()
  const bySite = []
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8')
    for (const name of calledNamesIn(src, f)) called.add(name)
    for (const h of sitesIn(src, f))
      bySite.push({ rel: path.relative(root, f), ...h })
  }
  const live = bySite.filter(s => s.fn && called.has(s.fn))
  const dead = bySite.filter(s => !s.fn || !called.has(s.fn))
  const fmt = s => `  ${s.rel}:${s.line}  ${s.fn || '(anon)'}()`
  console.log('LIKELY LIVE (enclosing fn is invoked in src) -- migrate these:')
  live
    .sort((a, b) => a.rel.localeCompare(b.rel))
    .forEach(s => console.log(fmt(s)))
  console.log(
    '\nLIKELY DEAD (enclosing fn never invoked) -- dead-code cleanup:'
  )
  dead
    .sort((a, b) => a.rel.localeCompare(b.rel))
    .forEach(s => console.log(fmt(s)))
  console.log(
    `\n${bySite.length} .single()-on-telegram_id sites | LIVE ${live.length} | DEAD ${dead.length}`
  )
  console.log(
    `telegram_id is NOT unique. Migrate the LIVE sites to ` +
      `.order('updated_at',{ascending:false}).limit(1); the DEAD ones are cleanup.`
  )
}

main()
