#!/usr/bin/env node
/**
 * Mints a JWT secret and the anon / service_role tokens for the self-hosted
 * PostgREST, and writes them straight into Railway.
 *
 *   node scripts/postgrest-mint-keys.cjs <postgrest-service-id>
 *
 * The values are generated, piped to `railway variables --set` and discarded.
 * Nothing secret is printed — only a SHA-256 fingerprint prefix, which is
 * enough to confirm two sides carry the same secret without revealing it.
 *
 * Token shape matches Supabase's so @supabase/supabase-js is unchanged: HS256,
 * claims {role, iss:'supabase', iat, exp}. PostgREST reads the `role` claim
 * (PGRST_JWT_ROLE_CLAIM_KEY defaults to '.role') and SET ROLEs into it.
 */
const crypto = require('crypto')
const { execFileSync } = require('child_process')

const SERVICE = process.argv[2]
const ENVIRONMENT = process.argv[3] || 'e4d200ad-b8a9-4edf-9b25-190a32613b32'
if (!SERVICE) {
  console.error(
    'usage: postgrest-mint-keys.cjs <postgrest-service-id> [environment-id]'
  )
  process.exit(1)
}

const b64 = buf =>
  Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

function jwt(payload, secret) {
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64(JSON.stringify(payload))
  const sig = b64(
    crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest()
  )
  return `${head}.${body}.${sig}`
}

// PostgREST refuses secrets shorter than 32 bytes.
const secret = crypto.randomBytes(48).toString('base64')

const iat = Math.floor(Date.parse('2026-01-01T00:00:00Z') / 1000)
const exp = Math.floor(Date.parse('2036-01-01T00:00:00Z') / 1000)
const mk = role => jwt({ role, iss: 'supabase', iat, exp }, secret)

const anonKey = mk('anon')
const serviceKey = mk('service_role')

const fp = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12)

function set(kv) {
  execFileSync(
    'railway',
    [
      'variables',
      '--service',
      SERVICE,
      '--environment',
      ENVIRONMENT,
      '--set',
      kv,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] }
  )
}

set(`PGRST_JWT_SECRET=${secret}`)
set(`SUPABASE_ANON_KEY_NEW=${anonKey}`)
set(`SUPABASE_SERVICE_ROLE_KEY_NEW=${serviceKey}`)

console.log('written to service', SERVICE)
console.log('  PGRST_JWT_SECRET              fp', fp(secret))
console.log('  SUPABASE_ANON_KEY_NEW         fp', fp(anonKey))
console.log('  SUPABASE_SERVICE_ROLE_KEY_NEW fp', fp(serviceKey))
console.log('\nThe two *_NEW keys are what the bot must use after cutover.')
console.log('They live on the PostgREST service so they can be referenced')
console.log('without ever being copied through a shell or a transcript.')
