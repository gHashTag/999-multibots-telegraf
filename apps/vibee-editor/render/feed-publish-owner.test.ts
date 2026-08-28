import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * POST /api/feed/publish must not take the post's owner from the request body.
 *
 * WHAT WAS WRONG. The handler parsed the body and passed it straight to
 * publishTemplateRow, which keys its upsert on data.telegram_id and re-stamps
 * creator_username from that user's row. The route is not public, so the global
 * guard required a credential — but a credential only proves the caller is
 * somebody, and the handler never asked who. Any signed-in mini-app user could
 * POST another user's telegram_id + name and overwrite their feed post, force
 * it public (is_public = TRUE) and resurrect one they had removed
 * (deleted_at = NULL), all still carrying the victim's real @username.
 *
 * Same class as sync-from-telegram (#975) and /api/assets: identity is present
 * but never compared against the resource. The fix mirrors the sibling
 * DELETE /api/feed/:id — the verified signer owns the write; the body's
 * telegram_id is trusted only for the internal X-Api-Key caller, for whom
 * chatIdentity is null.
 *
 * Source-level like the other seam tests here. It checks the order — identity
 * established, and the body's owner overridden, before the write — which is the
 * part a refactor changes silently. It does not boot the server.
 */

const SERVER = path.join(__dirname, 'render-server.ts')
const HEAD = "req.url === '/api/feed/publish'"

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

function handlerBody(): string {
  const src = fs.readFileSync(SERVER, 'utf8')
  const start = src.indexOf(HEAD)
  if (start === -1) return ''
  const rest = src.slice(start)
  // up to the next top-level route dispatch
  const end = rest.indexOf('\n  if (req.url')
  return stripComments(end === -1 ? rest : rest.slice(0, end))
}

describe('feed/publish takes the owner from the verified caller, not the body', () => {
  it('the handler is found — otherwise the checks below are empty', () => {
    expect(handlerBody().length).toBeGreaterThan(0)
  })

  it('establishes the signer before calling publishTemplateRow', () => {
    const body = handlerBody()
    const identity = Math.min(
      ...['chatIdentity(', 'verifiedTelegramId(']
        .map(x => body.indexOf(x))
        .filter(i => i >= 0)
        .concat([Number.MAX_SAFE_INTEGER])
    )
    const write = body.indexOf('publishTemplateRow(')

    expect(identity, 'no identity check in the handler').toBeLessThan(
      Number.MAX_SAFE_INTEGER
    )
    expect(write, 'publishTemplateRow not called').toBeGreaterThan(-1)
    expect(
      identity,
      `publishTemplateRow at ${write} runs before identity at ${identity}`
    ).toBeLessThan(write)
  })

  it('overrides the body telegram_id before the write', () => {
    // The verified owner must be written back onto data before publishTemplateRow,
    // so a signed caller cannot publish as someone else.
    const body = handlerBody()
    const override = body.search(/data\.telegram_id\s*=/)
    const write = body.indexOf('publishTemplateRow(')
    expect(override, 'body telegram_id is never overridden').toBeGreaterThan(-1)
    expect(override, 'override runs after the write').toBeLessThan(write)
  })

  it('refuses with 401 when there is no caller at all', () => {
    expect(handlerBody()).toContain('401')
  })
})
