import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

import { redactSensitiveUrl } from '@/utils/redactHeaders'

/**
 * The callback token is an HMAC over the RECIPIENT, minted by
 * buildCallbackToken and checked by verifyCallbackToken. It travels in the
 * query -- `?cb=<token>` -- because the provider offers no signature of its
 * own, so we sign our own callback address and verify that mark on the way in.
 *
 * The api_server request logger printed req.url verbatim, and req.url carries
 * the query. Every provider callback therefore wrote its own token into the
 * log, beside the telegram_id it is bound to. Headers at that same site were
 * already redacted; the token does not travel in a header.
 *
 * What a leaked token buys: not the whole bot, but "deliver any video and any
 * caption to THAT ONE person, from the bot they trust". The mark is bound to
 * the recipient, so it does not generalise to other users -- which is why this
 * is a disclosure bug and not a takeover.
 */
const FIXTURE_CB_VALUE = 'fixture-value-not-a-credential'

describe('redactSensitiveUrl: the callback token must not reach the log', () => {
  it('masks the cb value while keeping the key visible', () => {
    const out = redactSensitiveUrl(
      `/api/video-callback/144022504?cb=${FIXTURE_CB_VALUE}`
    )
    expect(out).not.toContain(FIXTURE_CB_VALUE)
    // The key survives: "was a token present?" is the usual diagnostic
    // question, and the routes already answer it that way (hasToken).
    expect(out).toContain('cb=<redacted>')
  })

  it('keeps the path, so the log still says which route was hit', () => {
    const out = redactSensitiveUrl(
      `/api/video-callback/144022504?cb=${FIXTURE_CB_VALUE}`
    )
    expect(out).toContain('/api/video-callback/144022504')
  })

  it('leaves ordinary parameters alone rather than blinding the log', () => {
    const out = redactSensitiveUrl(
      `/api/webhooks/replicate?taskId=abc123&cb=${FIXTURE_CB_VALUE}&mode=direct`
    )
    expect(out).toContain('taskId=abc123')
    expect(out).toContain('mode=direct')
    expect(out).not.toContain(FIXTURE_CB_VALUE)
  })

  it('passes through a url that carries no query', () => {
    expect(redactSensitiveUrl('/api/health')).toBe('/api/health')
  })

  it('does not throw on undefined', () => {
    expect(redactSensitiveUrl(undefined)).toBe('')
  })

  /**
   * The behavioural tests above prove the function is correct; they cannot see
   * whether the logger CALLS it. That is the whole defect, so it is asserted
   * against the source -- the same shape used for the stars-webhook path.
   */
  it('the api_server request logger routes req.url through the redactor', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../api_server/index.ts'),
      'utf8'
    )
    expect(source).toContain('url: redactSensitiveUrl(req.url)')
    expect(source).not.toContain('url: req.url,')
  })
})
