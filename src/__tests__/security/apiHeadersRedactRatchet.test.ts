/**
 * Supersedes apiLogNoSecretHeaders.test.ts. Two guards against the CWE-532
 * header-leak class (#1319 middleware + #this-PR: ai-reels-callback, robokassa,
 * x402 all re-logged req.headers verbatim, leaking x-secret-key / authorization
 * / x-telegram-bot-api-secret-token):
 *
 * 1) Behavioral: redactSensitiveHeaders masks the sensitive keys, keeps the rest.
 * 2) Ratchet: no api_server file logs raw `headers: req.headers` -- every header
 *    log must go through redactSensitiveHeaders. A new raw site fails CI.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { redactSensitiveHeaders } from '@/utils/redactHeaders'

describe('sensitive request headers are redacted before logging', () => {
  it('redactSensitiveHeaders masks secrets, preserves the rest', () => {
    const out = redactSensitiveHeaders({
      'x-secret-key': 'SUPER_SECRET',
      Authorization: 'Bearer abc',
      cookie: 'sid=1',
      'x-telegram-bot-api-secret-token': 'tg-secret',
      'content-type': 'application/json',
      'user-agent': 'curl',
    })
    expect(out['x-secret-key']).toBe('<redacted>')
    expect(out['Authorization']).toBe('<redacted>') // case-insensitive
    expect(out['cookie']).toBe('<redacted>')
    expect(out['x-telegram-bot-api-secret-token']).toBe('<redacted>')
    expect(out['content-type']).toBe('application/json')
    expect(out['user-agent']).toBe('curl')
  })

  it('handles undefined/null headers', () => {
    expect(redactSensitiveHeaders(undefined)).toEqual({})
    expect(redactSensitiveHeaders(null)).toEqual({})
  })

  it('no api_server file logs raw req.headers (ratchet)', () => {
    const root = path.join(__dirname, '..', '..', 'api_server')
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) {
          const s = fs.readFileSync(p, 'utf8')
          // raw `headers: req.headers` (the leak); the helper form is allowed
          if (/headers:\s*req\.headers[,)\s]/.test(s))
            offenders.push(p.replace(/.*\/src\//, 'src/'))
        }
      }
    }
    walk(root)
    expect(
      offenders,
      `api_server file(s) log raw req.headers (use redactSensitiveHeaders):\n${offenders.join('\n')}`
    ).toEqual([])
  })
})
