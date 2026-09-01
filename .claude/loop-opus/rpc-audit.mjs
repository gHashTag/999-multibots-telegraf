#!/usr/bin/env node
// tri rpc-audit -- list the supabase RPCs the code CALLS that are NOT defined in
// any repo migration (they live only inside the Supabase project).
//
// WHY THIS EXISTS. Several RPCs the code depends on have no CREATE FUNCTION in
// sql/ or migrations/ -- they were created directly in the Supabase dashboard.
// getUserBalance.ts documents the danger: on the Railway DB migration, get_user_balance
// did not exist there, so the RPC errored for EVERYONE, and a naive `return 0` would
// have shown every paying user "insufficient funds" (indistinguishable from theft).
// Undefined increment RPCs also silently fall back to app-side code -- and that
// fallback can be BROKEN (iter249 #1617: increment_superhero_generation_count's
// fallback used .upsert to bump a counter, which OVERWRITES not increments, so the
// 3/month free-superhero cap was bypassed -> unlimited free generations).
//
// This tool is the deployment/portability checklist: every RPC listed here MUST be
// recreated on any DB switch, and each should have a correct (non-upsert-counter)
// app-side fallback. It does NOT prove a fallback is correct -- that is a manual
// read (this tool points you at where to look).
//
// Usage: node .claude/loop-opus/rpc-audit.mjs [--self-check]

import fs from 'node:fs'
import path from 'node:path'

const walk = (d, re) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) return /node_modules|\.git/.test(p) ? [] : walk(p, re)
    return re.test(p) ? [p] : []
  })

/** RPC names passed to `.rpc('name'...)` in a source string. */
export function calledRpcs(source) {
  const out = new Set()
  const re = /\.rpc\(\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g
  let m
  while ((m = re.exec(source))) out.add(m[1])
  return out
}

/** RPC names defined by CREATE FUNCTION in a SQL string. */
export function definedRpcs(sql) {
  const out = new Set()
  const re =
    /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)/gi
  let m
  while ((m = re.exec(sql))) out.add(m[1])
  return out
}

function selfCheck() {
  const called = calledRpcs(`await s.rpc('foo', {}); x.rpc("bar")`)
  const defined = definedRpcs(
    `CREATE FUNCTION public.foo() ...; create or replace function baz() ...`
  )
  const ok =
    called.has('foo') &&
    called.has('bar') &&
    !called.has('baz') &&
    defined.has('foo') &&
    defined.has('baz') &&
    !defined.has('bar')
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
  const called = new Set()
  for (const f of walk(path.join(root, 'src'), /\.(ts|tsx)$/)) {
    if (/\.test\.|\.spec\.|__tests__|\/tests?\//.test(f)) continue
    for (const n of calledRpcs(fs.readFileSync(f, 'utf8'))) called.add(n)
  }
  const defined = new Set()
  for (const dir of ['sql', 'scripts', 'supabase', 'migrations']) {
    const d = path.join(root, dir)
    if (!fs.existsSync(d)) continue
    for (const f of walk(d, /\.sql$/))
      for (const n of definedRpcs(fs.readFileSync(f, 'utf8'))) defined.add(n)
  }
  const missing = [...called].filter(n => !defined.has(n)).sort()
  const present = [...called].filter(n => defined.has(n)).sort()
  console.log('== RPCs CALLED by code but NOT in repo migrations (DB-only) ==')
  console.log(
    '   (recreate each on any DB switch; verify each app-side fallback)'
  )
  if (!missing.length) console.log('   none')
  else missing.forEach(n => console.log(`   ! ${n}`))
  console.log('\n== RPCs called AND defined in repo migrations ==')
  present.forEach(n => console.log(`   . ${n}`))
  console.log(
    `\n${called.size} RPCs called | ${missing.length} DB-only (repo has no definition) | ${present.length} repo-defined`
  )
}

main()
