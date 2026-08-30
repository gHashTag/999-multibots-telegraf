/**
 * The API server's request-logging middleware logged `headers: req.headers`
 * verbatim, before any router. Inbound requests to the requireInternalKey-gated
 * routes (billing/models/diagnostic/neuro-photo/voice-avatar) carry
 * `x-secret-key: SECRET_API_KEY` (which also HMAC-signs callback tokens), and
 * Telegram webhooks carry `x-telegram-bot-api-secret-token`. The winston format
 * only redacts bot-tokens-in-URLs (redactBotToken), NOT header values, so those
 * secrets landed in the console + rotating log files in cleartext (CWE-532).
 *
 * Fix: mask x-secret-key / authorization / cookie / x-telegram-bot-api-secret-token
 * before logging. Source seam: the request logger must not pass raw req.headers,
 * and must reference a redaction of the sensitive header names. Mutation fails it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const code = () =>
  stripComments(
    fs.readFileSync(
      path.join(__dirname, '..', '..', 'api_server', 'index.ts'),
      'utf8'
    )
  )

describe('API request logger does not leak secret headers', () => {
  it('does not log raw req.headers', () => {
    expect(
      /headers:\s*req\.headers/.test(code()),
      'request logger passes raw req.headers -- leaks x-secret-key / authorization / telegram secret token'
    ).toBe(false)
  })

  it('masks the sensitive header names before logging', () => {
    const s = code()
    for (const h of [
      'x-secret-key',
      'authorization',
      'x-telegram-bot-api-secret-token',
    ]) {
      expect(
        s.includes(h),
        `sensitive header ${h} is not in the redaction set`
      ).toBe(true)
    }
  })
})
