import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * GET /api/users/:username must not expose a PRIVATE profile.
 *
 * WHAT WAS WRONG. The profiles-table branch (Attempt 1) selected is_public and
 * reported it (is_public: row.is_public !== false) but never ENFORCED it. The
 * route is in PUBLIC_GET_PREFIXES, so any unauthenticated caller could
 * GET /api/users/:username and receive a profile whose owner had set
 * is_public=false — telegram_id, bio, cover_url, social_links included. The
 * flag was decorative.
 *
 * The fix drops the built profile when it is private and the caller is not its
 * verified owner (verifiedTelegramId), so the private fields fall through to the
 * public-only fallbacks (public_templates) and then to 404. Public profiles are
 * unaffected.
 *
 * Source-level like the other seam tests here (the handler is a large branch in
 * a single request function; this checks the private-profile drop is present in
 * that branch, which a refactor changes silently). It does not boot the server.
 */
const SERVER = path.join(__dirname, 'render-server.ts')
const HEAD = '// GET /api/users/:username - Get user profile by username'

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

function routeBody(): string {
  const src = fs.readFileSync(SERVER, 'utf8')
  const start = src.indexOf(HEAD)
  if (start === -1) return ''
  const rest = src.slice(start)
  const end = rest.indexOf('// GET /api/render-quota')
  return stripComments(end === -1 ? rest : rest.slice(0, end))
}

describe('GET /api/users/:username enforces is_public', () => {
  it('the route is found — otherwise the checks below are empty', () => {
    expect(routeBody().length).toBeGreaterThan(0)
  })

  it('drops a private profile for a non-owner (verified viewer check + profile = null)', () => {
    const s = routeBody()
    // owner is established from the VERIFIED signer, never a query param
    expect(
      /verifiedTelegramId\(req\)/.test(s),
      'no verified-viewer check'
    ).toBe(true)
    // the private check compares is_public against the verified owner
    const privIdx = s.search(/row\.is_public === false/)
    expect(privIdx, 'no is_public === false private check').toBeGreaterThan(-1)
    // the drop must sit inside the is_public gate block (not the initial
    // `let profile = null` declaration far above)
    const gateBlock = s.slice(privIdx, privIdx + 400)
    expect(
      /profile = null/.test(gateBlock),
      'a private profile is not dropped by the is_public gate'
    ).toBe(true)
  })

  it('compares against the row owner, not a client-supplied id', () => {
    const s = routeBody()
    expect(
      /!==\s*String\(row\.telegram_id\)/.test(s),
      'private check does not compare the verified viewer to the row owner'
    ).toBe(true)
  })
})
