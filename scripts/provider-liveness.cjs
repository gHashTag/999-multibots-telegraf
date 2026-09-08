#!/usr/bin/env node
/**
 * A KEY BEING SET IS NOT A KEY THAT WORKS.
 *
 * `capabilityPreflight` answers "is the variable set", and that is the check
 * that has been wrong every time it mattered:
 *
 *   fal         set, and the account was locked: "Exhausted balance"
 *   elevenlabs  set, and it is an API key ID rather than an API key
 *   openai      set, and the provider answers 401 Incorrect API key
 *
 * Three services the bot advertises, three keys that pass the preflight, three
 * refusals at the moment a person asks for something. So this asks the
 * providers instead of asking the environment.
 *
 *   railway run -s 999-multibots-telegraf node scripts/provider-liveness.cjs
 *   ... --gate    exit 1 if a key is set and the provider rejects it
 *
 * Read-only, and no key is ever printed: only lengths, prefixes the provider
 * itself requires, and the provider's own verdict.
 */
const https = require('https')

const GATE = process.argv.includes('--gate')

const ask = (host, path, headers) =>
  new Promise(resolve => {
    const req = https.request(
      { host, path, method: 'GET', headers, timeout: 15000 },
      res => {
        let body = ''
        res.on('data', d => (body += d))
        res.on('end', () =>
          resolve({ code: res.statusCode, body: body.slice(0, 200) })
        )
      }
    )
    req.on('error', e =>
      resolve({ code: 0, body: String(e.message).slice(0, 80) })
    )
    req.on('timeout', () => {
      req.destroy()
      resolve({ code: 0, body: 'timeout' })
    })
    req.end()
  })

/**
 * Each provider, and what counts as "it knows this key".
 *
 * `alive` is deliberately not "status is 200". A 405 means the endpoint exists
 * and the request reached it -- the method was wrong, which is my mistake and
 * not the key's. Treating that as a dead key would be a false accusation, and
 * one this probe made on its first run against fal.
 */
const PROVIDERS = [
  {
    name: 'replicate',
    env: 'REPLICATE_API_TOKEN',
    host: 'api.replicate.com',
    path: '/v1/account',
    headers: k => ({ Authorization: `Bearer ${k}` }),
  },
  {
    name: 'openai',
    env: 'OPENAI_API_KEY',
    host: 'api.openai.com',
    path: '/v1/models',
    headers: k => ({ Authorization: `Bearer ${k}` }),
  },
  {
    name: 'elevenlabs',
    env: 'ELEVENLABS_API_KEY',
    host: 'api.elevenlabs.io',
    path: '/v1/user',
    headers: k => ({ 'xi-api-key': k }),
  },
]

/**
 * 401 and 403 are the provider saying no. But not every refusal comes with one:
 * ElevenLabs answers a wrong key with HTTP 400 and
 * `{"detail":{"type":"authentication_error","code":"invalid_api_key"}}` --
 * which the first version of this rule read as "knows this key", the quiet
 * direction and the dangerous one. So the body is read too.
 */
const REJECTED = new Set([401, 403])
const AUTH_REFUSAL =
  /invalid[_ ]api[_ ]key|authentication_error|incorrect api key|unauthorized|invalid token|api key ID used as API key/i

/*
 * Self-check, both directions, on the verdict function -- the part that decides
 * an accusation. A rejection must read as rejected; a 405 (wrong method, my
 * fault) and a 200 must not.
 */
const verdict = (code, body = '') => {
  if (code === 0) return 'UNREACHABLE'
  if (REJECTED.has(code)) return 'REJECTED'
  if (AUTH_REFUSAL.test(body)) return 'REJECTED'
  return 'accepted'
}
{
  const bad = []
  if (verdict(401) !== 'REJECTED') bad.push('a 401 must read as rejected')
  if (verdict(403) !== 'REJECTED') bad.push('a 403 must read as rejected')
  if (verdict(200) === 'REJECTED') bad.push('a 200 must not read as rejected')
  if (verdict(405) === 'REJECTED')
    bad.push('a 405 is my wrong method, not a dead key')
  if (verdict(0) !== 'UNREACHABLE')
    bad.push('a network failure must not be read as a verdict about the key')
  // The one the first version got wrong, in both directions.
  if (
    verdict(
      400,
      '{"detail":{"type":"authentication_error","code":"invalid_api_key"}}'
    ) !== 'REJECTED'
  )
    bad.push('a 400 whose body says the key is invalid must read as rejected')
  if (verdict(400, '{"detail":"Method Not Allowed"}') === 'REJECTED')
    bad.push('a 400 that says nothing about the key must NOT read as rejected')
  if (bad.length) {
    console.error('SELF-CHECK FAILED: the verdict rule is wrong:')
    for (const b of bad) console.error(`  ${b}`)
    process.exit(2)
  }
}

;(async () => {
  console.log(
    'self-check ok: 401/403 and an auth refusal in the body read as rejection;'
  )
  console.log('200, 405 and a plain 400 do not; a network failure is neither')
  console.log('')
  console.log('provider     set  len  provider says')

  let rejected = 0
  for (const p of PROVIDERS) {
    const key = (process.env[p.env] || '').trim()
    if (!key) {
      console.log(`${p.name.padEnd(12)} no    -   (not configured)`)
      continue
    }
    const r = await ask(p.host, p.path, p.headers(key))
    const v = verdict(r.code, r.body)
    if (v === 'REJECTED') rejected++
    const detail =
      v === 'accepted'
        ? `HTTP ${r.code} — knows this key`
        : v === 'UNREACHABLE'
          ? `could not reach: ${r.body}`
          : `HTTP ${r.code} — ${r.body.replace(/\s+/g, ' ').slice(0, 90)}`
    console.log(
      `${p.name.padEnd(12)} yes ${String(key.length).padStart(4)}  ${detail}`
    )
  }

  console.log('')
  console.log(
    'No key is printed here, only its length and what the provider said back.'
  )
  console.log(
    'A variable being SET is what capabilityPreflight checks; this checks the'
  )
  console.log('other thing, and the two have disagreed every time it mattered.')

  if (GATE && rejected > 0) {
    console.error('')
    console.error(
      `GATE RED: ${rejected} provider(s) reject a key the bot believes it has.`
    )
    console.error(
      'The bot will offer those services and refuse at the moment somebody asks.'
    )
    process.exit(1)
  }
})()
