/**
 * SSRF redirect-hop guard (#1327).
 *
 * sanitizeUrl (#1323) vets the ORIGINAL host of the user-typed lipSync URL, but
 * the generic download primitives follow up to 5 redirects: a public URL can
 * 302 to http://169.254.169.254/ (cloud metadata) or 127.0.0.1 and the target
 * host was never re-checked. assertPublicRedirect is wired as axios
 * `beforeRedirect` so every hop is re-validated against the SAME blocklist.
 *
 * The axios wiring itself needs a live redirecting server, so it is asserted
 * structurally here; the guard's decision logic is tested behaviorally.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { isPrivateHost, assertPublicRedirect } from '@/utils/sanitize'

describe('isPrivateHost', () => {
  const priv = [
    '169.254.169.254',
    '127.0.0.1',
    '10.1.2.3',
    '192.168.0.1',
    '172.16.0.1',
    'localhost',
    'foo.localhost',
    '::1',
    '[::1]',
    '::ffff:7f00:1', // IPv4-mapped loopback
    '::ffff:a9fe:a9fe', // IPv4-mapped metadata
    'fe80::1',
    'fc00::1',
  ]
  for (const h of priv) {
    it(`flags ${h} as private`, () => expect(isPrivateHost(h)).toBe(true))
  }
  const pub = [
    'cdn.example.com',
    'api.telegram.org',
    'fcbarcelona.com',
    '8.8.8.8',
  ]
  for (const h of pub) {
    it(`allows ${h}`, () => expect(isPrivateHost(h)).toBe(false))
  }
})

describe('assertPublicRedirect (axios beforeRedirect hop guard)', () => {
  it('throws when a redirect hop targets cloud metadata', () => {
    expect(() =>
      assertPublicRedirect({ hostname: '169.254.169.254' })
    ).toThrow()
  })
  it('throws when a redirect hop targets loopback', () => {
    expect(() => assertPublicRedirect({ hostname: '127.0.0.1' })).toThrow()
  })
  it('throws for IPv6 loopback given only host (with brackets+port)', () => {
    expect(() => assertPublicRedirect({ host: '[::1]:8080' })).toThrow()
  })
  it('throws for private IPv4 given only host (with port)', () => {
    expect(() => assertPublicRedirect({ host: '10.0.0.5:9000' })).toThrow()
  })
  it('passes a public redirect hop', () => {
    expect(() =>
      assertPublicRedirect({ hostname: 'cdn.example.com' })
    ).not.toThrow()
  })
  it('passes when host carries a port but is public', () => {
    expect(() =>
      assertPublicRedirect({ host: 'cdn.example.com:443' })
    ).not.toThrow()
  })

  // The case the guard used to allow. Its throw read
  // `if (host && isPrivateHost(host))`, so an options object that named no
  // host at all fell straight through and the hop was FOLLOWED. A guard whose
  // entire job is to block treated absence of the value as do-not-block.
  //
  // follow-redirects populates one of the two for any real hop, so refusing
  // here rejects nothing that occurs -- it removes the case where a hop nobody
  // could name was permitted.
  it.each([
    ['neither field', {}],
    ['both null', { hostname: null, host: null }],
    ['empty strings', { hostname: '', host: '' }],
    ['hostname undefined only', { hostname: undefined }],
  ])('throws when the next hop cannot be identified: %s', (_why, options) => {
    expect(() => assertPublicRedirect(options)).toThrow(/unidentifiable/)
  })
})

describe('download primitives wire the redirect guard (ratchet)', () => {
  const files = ['src/helpers/file-helpers.ts', 'src/helpers/downloadFile.ts']
  for (const f of files) {
    it(`${f} passes beforeRedirect: assertPublicRedirect to axios`, () => {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      expect(src).toMatch(/beforeRedirect:\s*assertPublicRedirect/)
      // and it must actually follow redirects (guard is meaningful)
      expect(src).toMatch(/maxRedirects:\s*[1-9]/)
    })
  }
})
