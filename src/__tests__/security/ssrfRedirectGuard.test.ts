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
import { readFileSync, readdirSync } from 'fs'
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
  /**
   * Computed, not listed.
   *
   * This block used to name two files by hand -- and that is exactly how the
   * other copies drifted. There are FOUR functions called downloadFile in the
   * tree: two in helpers, which carried the guard, one in
   * core/replicate/generateVideo.ts and one local to
   * services/localMorphingProcessor.ts, which did not. The first two are
   * near-identical to each other, differing in a console.log and in the
   * presence of this guard, so the copies were made before the fix and never
   * caught up.
   *
   * A hand-written list can only ratchet what its author already knew about.
   */
  const downloaders = (): string[] => {
    const out: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(join(process.cwd(), dir), {
        withFileTypes: true,
      })) {
        const rel = `${dir}/${e.name}`
        if (e.isDirectory()) {
          if (e.name !== '__tests__' && e.name !== 'node_modules') walk(rel)
        } else if (e.name.endsWith('.ts')) {
          const src = readFileSync(join(process.cwd(), rel), 'utf8')
          if (/(?:async\s+)?function\s+downloadFile\s*\(/.test(src))
            out.push(rel)
        }
      }
    }
    walk('src')
    return out
  }

  it('finds every downloadFile in the tree', () => {
    // Control: a shrunken population would let the assertion below pass while
    // checking almost nothing, which is the failure this block is recovering
    // from rather than a hypothetical one.
    expect(downloaders().length).toBeGreaterThanOrEqual(4)
  })

  it('every downloadFile passes beforeRedirect: assertPublicRedirect', () => {
    const unguarded = downloaders().filter(
      f =>
        !/beforeRedirect:\s*assertPublicRedirect/.test(
          readFileSync(join(process.cwd(), f), 'utf8')
        )
    )
    expect(unguarded).toEqual([])
  })

  it('every downloadFile actually follows redirects, so the guard means something', () => {
    const notFollowing = downloaders().filter(f => {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      // axios follows redirects by default; an explicit maxRedirects: 0 would
      // make the guard vacuous rather than protective.
      return /maxRedirects:\s*0\b/.test(src)
    })
    expect(notFollowing).toEqual([])
  })
})
