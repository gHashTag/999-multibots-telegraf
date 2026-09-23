import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A PROFILE IS FOR THE CLUB, AND EVERY DOOR TO ONE KNOWS IT.
 *
 * Owner, 2026-09-23: "profiles must be visible only to registered club
 * members!! by payment!".
 *
 * Until that day three GET routes served the same record and not one of them
 * asked anything: `/api/users/:username`, `/api/users/:username/templates`
 * and `/api/users/id/:telegram_id`. Closing two of three would not be a
 * paywall -- it would be a paywall with a side door, and the side door is the
 * one that gets found.
 *
 * This reads the server's source rather than its behaviour on purpose: the
 * decision itself is unit-tested in src/club/profile-visibility.test.ts, and
 * what can silently rot here is a FOURTH route appearing without the gate, or
 * the gate being deleted from one of the three while the tests of the other
 * two stay green.
 */

const SERVER = readFileSync(join(__dirname, 'render-server.ts'), 'utf8')

/** The body of the `if (...)` block that starts at `head`, brace-balanced. */
function handler(head: string): string {
  const at = SERVER.indexOf(head)
  expect(at, `${head} is gone from the server`).toBeGreaterThan(-1)
  let depth = 0
  for (let i = SERVER.indexOf('{', at); i < SERVER.length; i++) {
    if (SERVER[i] === '{') depth++
    else if (SERVER[i] === '}' && --depth === 0) return SERVER.slice(at, i + 1)
  }
  throw new Error(`unbalanced braces after ${head}`)
}

describe('every door to a profile asks the club', () => {
  it('the profile by name', () => {
    const body = handler(
      '  // GET /api/users/:username - Get user profile by username'
    )
    expect(body).toContain('refuseUnlessClub(req, res, row.telegram_id)')
  })

  it('the same profile by id', () => {
    const body = handler('  // GET /api/users/id/:telegram_id')
    expect(body).toContain('refuseUnlessClub(req, res, telegram_id)')
  })

  it("a person's work, which is part of their profile", () => {
    const body = handler(
      "    /^\\/api\\/users\\/[^/]+\\/templates$/.test(req.url?.split('?')[0] || '')"
    )
    expect(body).toMatch(/refuseUnlessClub\(req, res, ownerId/)
  })

  it('the gate answers 403, not 401: the caller may be known and not a member', () => {
    const gate = readFileSync(
      join(__dirname, 'src', 'club', 'profile-visibility.ts'),
      'utf8'
    )
    expect(gate).toContain('export const CLUB_ONLY_STATUS = 403')
    // An app that reads 401 as "sign in again" would send a signed-in
    // non-member round a loop that changes nothing.
    expect(SERVER).not.toMatch(/CLUB_ONLY_STATUS\s*=\s*401/)
  })

  it('SOUL.md stays open, because that decision is written down twice', () => {
    // render-server.ts above the handler and auth.ts:400 both record it:
    // people and a2a agents find each other by SOUL, and a closed SOUL
    // connects nobody. If this ever changes it must be a decision, not a
    // side effect of closing profiles.
    const soul = handler(
      "  if (req.url?.startsWith('/api/soul/') && req.method === 'GET') {"
    )
    expect(soul).not.toContain('refuseUnlessClub')
    const auth = readFileSync(join(__dirname, 'auth.ts'), 'utf8')
    expect(auth).toContain("'/api/soul/'")
  })

  it('the grant is resolved in one place, so a second caller cannot copy it', () => {
    // Bot owners, keepers and invited guests are members without paying.
    // Before the gate this lived inline in the club route; a copy here would
    // have drifted the way the two navigation lists did.
    expect(SERVER).toContain('function clubGrantSource()')
    expect(SERVER.match(/botsOwnedBy: async/g) ?? []).toHaveLength(1)
    expect(SERVER).toContain('grant: clubGrantSource()')
  })
})
