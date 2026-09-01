import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * POST /api/users/sync-from-telegram must not believe initData it has not
 * verified.
 *
 * WHAT WAS WRONG. The route is on the public list in auth.ts, so the global
 * guard does not look at it — the handler is the only thing standing there. It
 * read `x-telegram-init-data`, parsed `user.id` straight out of it, and used
 * that id to run `UPDATE users SET username = $2, first_name = $3 WHERE
 * telegram_id = $1` and to upsert a profile row. Nothing checked the signature.
 * A forged header naming someone else's id was enough to rewrite their username,
 * first name, display name and avatar. No key, no session, no signature.
 *
 * The check already existed and was simply not used here: verifiedTelegramId()
 * reads the same header and rejects it unless verifyTelegramInitData() passes
 * (auth.ts:413). The branch right below in the same handler is careful in
 * exactly the right way — it trusts the body only when it matches the owner of
 * an agent key — which is what made the header branch stand out.
 *
 * This test reads the source rather than booting the server, like the other
 * seam tests here. It is coarse, and it is the shape of the defect: an
 * unverified header believed before it is checked.
 */

const SERVER = path.join(__dirname, 'render-server.ts')
const HEAD = "'/api/users/sync-from-telegram'"

/**
 * Comments are blanked in place, keeping their length and newlines.
 *
 * Without this the test matched its own explanation: the comment above the fix
 * quotes the very SQL it is about, so `UPDATE users` was found in prose,
 * earlier than the check, and the test reported a defect that was not there.
 * A test that reads source has to read the code, not the commentary on it.
 */
function stripComments(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )
}

function handlerBody(): string {
  const src = fs.readFileSync(SERVER, 'utf8')
  const start = src.indexOf(HEAD)
  if (start === -1) return ''
  const rest = src.slice(start)
  const end = rest.indexOf('\n  if (req.url')
  return stripComments(end === -1 ? rest : rest.slice(0, end))
}

describe('sync-from-telegram verifies initData before believing it', () => {
  it('the handler is found — otherwise the checks below are empty', () => {
    expect(handlerBody().length).toBeGreaterThan(0)
  })

  it('checks the signature before reading a user out of the header', () => {
    const body = handlerBody()
    const verify = body.indexOf('verifyTelegramInitData(')
    const readsUser = body.indexOf("params.get('user')")

    expect(verify, 'no signature check in the handler at all').toBeGreaterThan(
      -1
    )
    if (readsUser !== -1) {
      expect(
        verify,
        `initData is parsed at ${readsUser} before it is verified at ${verify}`
      ).toBeLessThan(readsUser)
    }
  })

  it('the id written to the database comes from a checked branch', () => {
    // The write is the consequence that made this worth fixing rather than
    // noting: an unverified id reached an UPDATE keyed on telegram_id.
    const body = handlerBody()
    const verify = body.indexOf('verifyTelegramInitData(')
    const update = body.indexOf('UPDATE users')
    expect(verify).toBeGreaterThan(-1)
    if (update !== -1) expect(verify).toBeLessThan(update)
  })

  it('a browser session can only read the profile persisted at verified login', () => {
    const body = handlerBody()
    expect(body).toContain('chatIdentity(req, null)')
    expect(body).toContain('FROM profiles WHERE telegram_id = $1')
    expect(body).not.toContain('String(body.id)')
    expect(body).not.toContain('body.first_name')
    expect(body).toContain('401')
  })
})
