#!/usr/bin/env node
'use strict'
/**
 * A URL WE HAND OUT MUST BE A URL WE ANSWER.
 *
 * Robokassa was called back for nine months at `${base}/payment-success` while
 * the router serving it is mounted under '/api'. Both halves were individually
 * correct and disagreed only about where they met, so every shape-checking test
 * around that route passed. This census asks the joining question instead:
 * of the URLs this code builds on its OWN host, which land on a route?
 *
 *   node scripts/url-reachability.cjs            list them
 *   ... --gate                                   exit 1 on an undeclared one
 *
 * THE DISCRIMINATOR IS THE BASE, NOT THE PATH. A concatenation onto somebody
 * else's host is their business: `${this.baseUrl}/predictions` is Replicate's
 * route, and BAZA in trinityAgent is a hard-coded vibee-render URL -- a
 * different service, whose routes are not in this repo. Only a base naming OUR
 * host is a claim about a route WE have to serve.
 *
 * THE GROUND TRUTH IS THE EXPENSIVE HALF. A short list of served routes
 * over-accuses, silently. The import regex here is the one from
 * routesAreMounted.test.ts, written after a naive version dropped
 * kie-ai-webhook -- that file is imported as `import kieAiWebhookRouter, {`
 * with named bindings on following lines, and a regex demanding `from` right
 * after the identifier never matches it. My own first pass repeated exactly
 * that mistake and produced 25 accusations where the truth was fewer. So this
 * file refuses to print anything if a mounted router resolves to nothing.
 *
 * WHAT IT FOUND, 2026-09-08. Two instances beyond the Robokassa one, and the
 * second is the reason this is a reporting tool rather than a fixing one:
 *
 *   handleTopUp.ts:95   paid_btn_url = WEBHOOK_URL + '/payment-success'
 *     CryptoBot's post-payment button, pointing at the same 404. I first read
 *     this as a live defect on the working channel and it is not: it sits in
 *     handleTopUpWithAmount, which is exported and called from NOWHERE, whose
 *     CRYPTOBOT_API_TOKEN is unset in production, and which has produced zero
 *     rows ever. Declared, not fixed -- repairing a URL in unreachable code
 *     only makes a dead path look alive.
 *
 *   generateVoiceAvatar.ts:20   POST `${PUBLIC_URL}/generate/voice-avatar`
 *     THE OBVIOUS FIX HERE IS THE HARMFUL ONE. voice-avatar.routes.ts declares
 *     that path and is mounted at '/api', so adding the prefix looks right --
 *     but that route's handler imports and calls generateVoiceAvatar itself.
 *     Correcting the path would make the route POST to itself forever. The 404
 *     is load-bearing. The real repair is architectural (call the
 *     implementation directly, or point the service at the AI server it was
 *     written for), and it is nobody's business to make it in passing.
 */
const fs = require('fs')
const path = require('path')
const ROOT = process.cwd()
const idx = fs.readFileSync(path.join(ROOT, 'src/api_server/index.ts'), 'utf8')

const imports = {}
for (const m of idx.matchAll(
  /import\s+(\w+)\s*(?:,\s*\{[\s\S]*?\})?\s*from\s+'(\.[^']+)'/g
))
  imports[m[1]] = m[2]

const served = new Set()
for (const m of idx.matchAll(
  /app\.(get|post|put|patch|delete|all)\(\s*'([^']+)'/g
))
  served.add(m[2])
for (const m of idx.matchAll(/app\.use\(\s*'([^']+)'\s*,\s*express\.static/g))
  served.add(m[1].replace(/\/+$/, '') + '/*')

const unresolved = []
for (const m of idx.matchAll(/\.use\(\s*'([^']+)'\s*,([^)]*)\)/g)) {
  const prefix = m[1].replace(/\/+$/, '')
  for (const id of m[2].match(/\w+/g) || []) {
    const rel = imports[id]
    if (!rel || !rel.includes('routes/')) continue
    const file = path.join(
      ROOT,
      'src/api_server',
      rel.replace(/^\.\//, '') + '.ts'
    )
    if (!fs.existsSync(file)) {
      unresolved.push(`${id} -> ${rel} (no such file)`)
      continue
    }
    const src = fs.readFileSync(file, 'utf8')
    let n = 0
    for (const r of src.matchAll(
      /router\.(get|post|put|patch|delete|all)\(\s*'([^']+)'/g
    )) {
      served.add((prefix + r[2]).replace(/\/{2,}/g, '/'))
      n++
    }
    if (n === 0) unresolved.push(`${id} (mounted, zero paths parsed)`)
  }
}

const matchers = [...served].map(
  p =>
    new RegExp(
      '^' +
        p
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\\\*$/, '.*')
          .replace(/:\w+/g, '[^/]+') +
        '$'
    )
)
const isServed = p => matchers.some(re => re.test(p))

/** Bases that name THIS app's own host. BAZA is deliberately absent. */
const OUR_BASE =
  /^(process\.env\.)?(BASE_WEBHOOK_URL|WEBHOOK_URL|API_SERVER_URL|PUBLIC_URL|SERVER_PUBLIC_URL|LOCAL_SERVER_URL|SELF_URL|NGROK|CLOUDFLARE_TUNNEL_URL|tunnelUrl|baseWebhookUrl|publicUrl)$/

const files = []
;(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name)
    if (e.isDirectory()) {
      if (!/node_modules|__tests__|\.git/.test(f)) walk(f)
    } else if (f.endsWith('.ts')) files.push(f)
  }
})(path.join(ROOT, 'src'))

const found = []
for (const file of files) {
  fs.readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const t = line.trim()
      if (t.startsWith('//') || t.startsWith('*')) return
      const push = (base, url) => {
        if (OUR_BASE.test(base.trim()))
          found.push({
            file: path.relative(ROOT, file),
            line: i + 1,
            base: base.trim(),
            url,
            text: t.slice(0, 100),
          })
      }
      for (const m of line.matchAll(/\$\{([^}]+)\}(\/[\w\-/${}:.]*)/g))
        push(m[1], m[2])
      for (const m of line.matchAll(/([\w.]+)\s*\+\s*'(\/[\w\-/]*)'/g))
        push(m[1], m[2])
    })
}
const norm = u =>
  u
    .replace(/\$\{[^}]*\}/g, 'X')
    .replace(/\?.*$/, '')
    .replace(/\/+$/, '') || '/'

/**
 * Known and reasoned. An entry here is a URL that does not land on a route and
 * is not going to be repaired by editing the path -- with the reason, so the
 * next reader is not tempted to "fix" it. Adding a line here is a decision;
 * that is the point.
 */
const DECLARED = {
  'src/handlers/paymentHandlers/handleTopUp.ts:/payment-success':
    "CryptoBot's paid_btn_url, inside handleTopUpWithAmount -- which is exported " +
    'and called from nowhere, and whose CRYPTOBOT_API_TOKEN is not set in ' +
    'production either. Zero CryptoBot rows have ever existed. Repairing a URL ' +
    'in unreachable code would only make the dead path look alive.',
  'src/api_server/index.ts:/payment-success':
    'a startup log line, not a URL handed to anybody. Misleading to a developer reading the boot output, harmless to a person.',
  'src/services/generateVoiceAvatar.ts:/generate/voice-avatar':
    'the route that serves this path CALLS this function; correcting the path would make it POST to itself forever. Architectural, not a prefix.',
  'src/core/ai-server/generateAiServerLipSync.ts:/api/lipsync/X':
    'built for a separate AI server that this repo does not contain; no route file declares lipsync.',
  'src/core/ai-server/generateAiServerLipSync.ts:/api/lipsync/X/cancel':
    'same as above.',
  'src/core/synclabs/generateLipSync/index.ts:/api/synclabs-webhook':
    'no route file declares it; the synclabs integration has no receiving end in this repo.',
  'src/services/video-providers/KieAiProvider.ts:/api/music-callback':
    'no route file declares it; kie-ai declares /video-callback and the sora paths, not music.',
  'src/inngest_app/functions/morphImages.ts:/uploads/X/morphing/final_video_${Date.now':
    'an nginx-era static path; Railway serves no /uploads.',
  'src/inngest_app/functions/neuroImageGeneration.ts:/uploads/X/neuro-photo/${path.basename':
    'same nginx-era static path.',
  'src/services/generateMorphing.ts:/files/X':
    'same nginx-era static path; Railway serves no /files.',
}

const fail = m => {
  console.error('SELF-CHECK FAILED: ' + m)
  process.exit(2)
}
if (unresolved.length)
  fail(
    'these mounted routers resolved to no paths, so the ground truth is short ' +
      'and every accusation below would be suspect:\n  ' +
      unresolved.join('\n  ')
  )
if (served.size < 30)
  fail(`only ${served.size} routes parsed; a short ground truth over-accuses.`)
if (!isServed('/api/payment-success'))
  fail('a route known to exist reads as unserved.')
if (!isServed('/api/kie-ai/callback'))
  fail('kie-ai routes are missing -- the multi-line import is being dropped.')
if (isServed('/payment-success'))
  fail('a path known NOT to exist reads as served; the matcher is too loose.')
if (!found.length) fail('no URL is built on any of our own bases.')

const bad = found.filter(f => !isServed(norm(f.url)))
const key = f => `${f.file}:${norm(f.url)}`
const undeclared = []
const seen = new Set()
for (const f of bad) {
  if (seen.has(key(f))) continue
  seen.add(key(f))
  if (!(key(f) in DECLARED)) undeclared.push(f)
}

/*
 * A DECLARATION THAT OUTLIVED ITS REASON HIDES THE NEXT FINDING. If a URL on
 * the list now lands on a route -- or the line that built it is gone -- the
 * entry must go too, or it becomes a permanent hole in the gate. Same rule as
 * the known-unmounted list in routesAreMounted.test.ts.
 */
const stale = Object.keys(DECLARED).filter(k => !seen.has(k))
if (stale.length) {
  console.error('SELF-CHECK FAILED: these declarations no longer describe')
  console.error(
    'anything -- the URL now lands on a route, or its line is gone.'
  )
  console.error('Remove them, or the gate keeps a hole where they were:')
  for (const k of stale) console.error('  ' + k)
  process.exit(2)
}

console.log(`served routes parsed:        ${served.size}`)
console.log(`URLs built on our own host:  ${found.length}`)
console.log(`  land on a route:           ${found.length - bad.length}`)
console.log(`  do not, and are declared:  ${seen.size - undeclared.length}`)
console.log(`  do not, and are NOT:       ${undeclared.length}`)
console.log('')

if (undeclared.length) {
  console.log('NOT DECLARED -- a URL we hand out that nothing here answers:')
  for (const f of undeclared)
    console.log(
      `  ${f.file}:${f.line}\n      ${norm(f.url)}   (base ${f.base})\n      ${f.text}`
    )
  console.log('')
  console.log(
    'Read the route file before adding a prefix: see generateVoiceAvatar in the'
  )
  console.log('header of this script for a case where that is the wrong fix.')
}

process.exit(process.argv.includes('--gate') && undeclared.length ? 1 : 0)
