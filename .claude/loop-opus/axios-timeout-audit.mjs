#!/usr/bin/env node
// tri axios-timeout-audit -- find axios calls that lack a `timeout`, reliably.
//
// WHY THIS EXISTS. A line-window sweep for `timeout` near an `axios(` gives
// ~50% FALSE POSITIVES: axios option objects are often 15-28 lines long, so the
// `timeout:` sits past a fixed window and the call is wrongly reported as
// missing one (the same narrow-window trap that bit the #1428/#1431 ratchets).
// This tool matches the FULL call via paren balancing, so "has timeout" is exact.
//
// An axios call with no timeout waits INDEFINITELY. Two positions are dangerous:
//   1. inside a retry loop (`while attempts < max`) -- one hang defeats the bound
//      AND skips any fallback in the enclosing catch (fixed: videoTranscription
//      #1443).
//   2. under an in-flight/re-entrancy guard -- the guard flag never releases, so
//      the poller is stuck forever (see multibots_poll_timeout_and_guard).
// One-shot calls are lower severity (a hang blocks one request).
//
// The report also hints LIVENESS: many timeout-less calls sit in DEAD exports
// (no caller), where a "fix" is pointless churn -- so triage before editing.
//
// Usage: node .claude/loop-opus/axios-timeout-audit.mjs [srcDir]
//        node .claude/loop-opus/axios-timeout-audit.mjs --self-check

import fs from 'node:fs'
import path from 'node:path'

const walk = d =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) return walk(p)
    return e.isFile() && p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : []
  })

// Return the substring of the full axios(...) call starting at `fromIdx`
// (index of 'axios'), balanced across parens/strings so nested () don't fool it.
function balancedCall(text, fromIdx) {
  const open = text.indexOf('(', fromIdx)
  if (open === -1) return ''
  let depth = 0
  let str = null // ' " ` when inside a string literal
  for (let i = open; i < text.length; i++) {
    const c = text[i]
    if (str) {
      if (c === '\\') {
        i++
        continue
      }
      if (c === str) str = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      str = c
      continue
    }
    if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0) return text.slice(open, i + 1)
    }
  }
  return text.slice(open) // unbalanced -- return the rest
}

// Every axios call in a file: { line, hasTimeout, spanLines }.
// Blank out //... and /* ... */ comments by replacing their characters with
// spaces (newlines preserved), so a commented-out `// await axios.post(...)` is
// not counted as a call, WITHOUT shifting any line/column position. String
// literals are respected so a `//` inside a string is not treated as a comment.
function blankComments(text) {
  const out = text.split('')
  let str = null // ' " ` when inside a string literal
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (str) {
      if (c === '\\') {
        i++
        continue
      }
      if (c === str) str = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      str = c
      continue
    }
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') {
        out[i] = ' '
        i++
      }
      i--
      continue
    }
    if (c === '/' && text[i + 1] === '*') {
      out[i] = ' '
      out[i + 1] = ' '
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] !== '\n') out[i] = ' '
        i++
      }
      if (i < text.length) {
        out[i] = ' '
        out[i + 1] = ' '
        i++
      }
      continue
    }
  }
  return out.join('')
}

export function axiosCalls(source) {
  const code = blankComments(source)
  const calls = []
  const re = /\baxios(\.(get|post|put|patch|delete|request|head))?\s*\(/g
  let m
  while ((m = re.exec(code))) {
    const call = balancedCall(code, m.index)
    const before = code.slice(0, m.index)
    const line = before.split('\n').length
    calls.push({
      line,
      hasTimeout: /\btimeout\s*:/.test(call),
      spanLines: call.split('\n').length,
    })
  }
  return calls
}

function selfCheck() {
  // A control that cannot fail proves nothing: the matcher must report BOTH,
  // and must NOT be fooled by a timeout that sits many lines below the call.
  const snippet = [
    'const a = await axios.post(url, body, {',
    '  headers: { Authorization: `Bearer ${k}` },',
    '  responseType: "json",',
    '  // padding line 1',
    '  // padding line 2',
    '  // padding line 3',
    '  // padding line 4',
    '  // padding line 5',
    '  // padding line 6',
    '  // padding line 7',
    '  // padding line 8',
    '  // padding line 9',
    '  // padding line 10',
    '  // padding line 11',
    '  // padding line 12',
    '  timeout: 30000,', // far below the call -- a window would miss this
    '})',
    'const b = await axios.get(statusUrl, { headers: {} })', // genuinely none
    '// const dead = await axios.post(deadUrl, {}) -- commented out, NOT a call',
  ].join('\n')
  const calls = axiosCalls(snippet)
  const got = calls.map(c => c.hasTimeout)
  const ok = calls.length === 2 && got[0] === true && got[1] === false
  console.log(ok ? 'SELF-CHECK OK' : 'SELF-CHECK FAILED', JSON.stringify(got))
  process.exit(ok ? 0 : 1)
}

function main() {
  const arg = process.argv[2]
  if (arg === '--self-check') return selfCheck()
  const root = arg || 'src'
  const files = walk(root)
  const missing = []
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8')
    for (const c of axiosCalls(src)) {
      if (!c.hasTimeout) missing.push({ file: f, ...c })
    }
  }
  // Liveness hint: is the file's basename referenced elsewhere (cheap proxy)?
  const allSrc = files.map(f => fs.readFileSync(f, 'utf8'))
  const isLikelyLive = file => {
    const base = path.basename(file).replace(/\.ts$/, '')
    let refs = 0
    for (let i = 0; i < files.length; i++) {
      if (files[i] === file) continue
      if (allSrc[i].includes(base)) refs++
    }
    return refs > 0
  }
  console.log(
    `axios calls without a timeout (paren-balanced): ${missing.length}\n`
  )
  const live = missing.filter(m => isLikelyLive(m.file))
  const dead = missing.filter(m => !isLikelyLive(m.file))
  console.log(`-- likely LIVE (module referenced elsewhere) -- triage these:`)
  for (const m of live)
    console.log(`   ${m.file}:${m.line}  (call spans ${m.spanLines} lines)`)
  console.log(
    `\n-- likely DEAD (module not referenced) -- a fix is probably churn:`
  )
  for (const m of dead) console.log(`   ${m.file}:${m.line}`)
}

main()
