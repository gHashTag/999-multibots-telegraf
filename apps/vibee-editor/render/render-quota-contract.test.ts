/**
 * Regression test: /api/render-quota must answer in the shape the client reads,
 * and must not take "am I an admin" from a query parameter.
 *
 * Two stacked defects made the quota chip and the freemium gate dead in
 * production:
 *  - the client fetched it WITHOUT the signature while the route is not public
 *    and the server runs in enforce mode, so it always 401'd;
 *  - even when it loaded, the server answered quota_used/quota_limit/
 *    quota_remaining while every reader uses the shared RenderQuota type
 *    (total_renders / free_remaining / subscription), so canRenderAtom
 *    evaluated `undefined > 0` and DENIED every non-admin user.
 *
 * Source-level assertions: booting the whole render server here would pull in
 * ffmpeg/face-api native deps (the reason a local boot has never worked in this
 * repo), so the contract is pinned against the source of both sides.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const REPO = path.resolve(__dirname, '../../..')
const SERVER = fs.readFileSync(
  path.join(REPO, 'apps/vibee-editor/render/render-server.ts'),
  'utf8'
)
const CLIENT = fs.readFileSync(
  path.join(REPO, 'apps/vibee-editor/player/src/atoms/user.ts'),
  'utf8'
)
const TYPES = fs.readFileSync(
  path.join(REPO, 'apps/vibee-editor/packages/vibee-atoms/src/types.ts'),
  'utf8'
)

/** Strip comments: the prose explaining the old fields must not be mistaken
 * for the fields themselves. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

function quotaHandler(): string {
  const start = SERVER.indexOf("if (req.url?.startsWith('/api/render-quota')")
  expect(start, 'render-quota handler not found').toBeGreaterThan(-1)
  return stripComments(SERVER.slice(start, start + 2500))
}

describe('/api/render-quota contract', () => {
  const handler = quotaHandler()

  it('answers with the fields the shared RenderQuota type declares', () => {
    for (const field of ['total_renders', 'free_remaining', 'subscription']) {
      expect(TYPES, `RenderQuota lost ${field}`).toContain(field)
      expect(handler, `handler stopped sending ${field}`).toContain(field)
    }
  })

  it('no longer answers with fields nothing reads', () => {
    expect(handler).not.toContain('quota_remaining')
    expect(handler).not.toContain('quota_limit')
  })

  it('derives admin from the verified caller, not the query parameter', () => {
    expect(handler).toContain('verifiedTelegramId(req)')
    // The old form compared the raw query param directly.
    expect(handler).not.toMatch(
      /const isAdmin = telegram_id === TELEGRAM_OWNER_ID/
    )
  })
})

describe('the client sends the signature', () => {
  it('fetchQuota passes authHeaders', () => {
    const idx = CLIENT.indexOf('`${API_BASE}/api/render-quota')
    expect(idx, 'quota fetch call not found').toBeGreaterThan(-1)
    const call = CLIENT.slice(idx, idx + 200)
    expect(call).toContain('authHeaders()')
  })

  it('authHeaders is imported', () => {
    expect(CLIENT).toContain("from '../lib/apiFetch'")
  })
})
