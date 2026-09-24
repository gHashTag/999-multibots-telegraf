/**
 * WHERE THE BOT REACHES THE RENDER.
 *
 * The incident this pins, 2026-09-23: Railway filled
 * RAILWAY_SERVICE_VIBEE_RENDER_URL with `auth.t27.ai`, a custom domain of the
 * render that answers only the sign-in doors. Every attachment a person sent
 * the agent got `404 {"error":"not found"}` from /upload and was reported as
 * "did not save on our side, try again".
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import {
  RENDER_RAILWAY_DOMAIN,
  SIGN_IN_ONLY_HOSTS,
  renderBaseUrl,
} from '@/services/renderServer/baseUrl'

const ENV_KEYS = [
  'RENDER_SERVER_URL',
  'VIBEE_RENDER_URL',
  'RAILWAY_SERVICE_VIBEE_RENDER_URL',
] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('renderBaseUrl', () => {
  it('the Railway variable naming the sign-in host is not the render API', () => {
    // Exactly what production held on 2026-09-23: a bare host, no scheme.
    process.env.RAILWAY_SERVICE_VIBEE_RENDER_URL = 'auth.t27.ai'
    expect(renderBaseUrl()).toBe(RENDER_RAILWAY_DOMAIN)
  })

  it('the sign-in host is recognised in any case and with a scheme', () => {
    process.env.RAILWAY_SERVICE_VIBEE_RENDER_URL = 'https://AUTH.t27.ai/'
    expect(renderBaseUrl()).toBe(RENDER_RAILWAY_DOMAIN)
  })

  it('any other host from Railway is used as given, scheme added', () => {
    // A second custom domain that serves the whole render must keep working:
    // the rule is about the sign-in host, not about custom domains.
    process.env.RAILWAY_SERVICE_VIBEE_RENDER_URL = 'render.example.org'
    expect(renderBaseUrl()).toBe('https://render.example.org')
  })

  it('an explicit setting wins over the Railway variable', () => {
    process.env.RAILWAY_SERVICE_VIBEE_RENDER_URL = 'auth.t27.ai'
    process.env.RENDER_SERVER_URL = 'http://localhost:4000/'
    expect(renderBaseUrl()).toBe('http://localhost:4000')
  })

  it('VIBEE_RENDER_URL is read when RENDER_SERVER_URL is absent', () => {
    process.env.VIBEE_RENDER_URL = 'https://render.test'
    process.env.RAILWAY_SERVICE_VIBEE_RENDER_URL = 'other.test'
    expect(renderBaseUrl()).toBe('https://render.test')
  })

  it('an explicit sign-in host is skipped, not obeyed', () => {
    process.env.RENDER_SERVER_URL = 'https://auth.t27.ai'
    process.env.RAILWAY_SERVICE_VIBEE_RENDER_URL = 'render.example.org'
    expect(renderBaseUrl()).toBe('https://render.example.org')
  })

  it('nothing configured is an empty answer, not a guessed host', () => {
    expect(renderBaseUrl()).toBe('')
    process.env.RENDER_SERVER_URL = '   '
    expect(renderBaseUrl()).toBe('')
  })
})

describe('the sign-in host agrees with the render', () => {
  /*
   * The bot cannot import from the render package, so the host is a copy.
   * If the render moves its refresh cookie to another host, this goes red
   * instead of the bot quietly uploading to a host that refuses it.
   */
  it('AUTH_HOST in the render is in SIGN_IN_ONLY_HOSTS', () => {
    const file = path.resolve(
      __dirname,
      '../../../apps/vibee-editor/render/src/auth/refresh-cookie.ts'
    )
    const source = fs.readFileSync(file, 'utf8')
    const match = source.match(/export const AUTH_HOST = '([^']+)'/)
    expect(
      match,
      'AUTH_HOST declaration not found in the render'
    ).not.toBeNull()
    expect(SIGN_IN_ONLY_HOSTS).toContain(match![1])
  })
})
