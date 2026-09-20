/**
 * The image URL check that guards a paid render job.
 *
 * Its whole reason to exist is money: a URL the provider cannot fetch still
 * creates a billed job, so every case below is either "we would have paid for
 * nothing" or "we would have rejected a URL that works". The second kind is
 * the dangerous one -- a check that is too strict silently breaks real
 * generations -- so the accepting tests carry the shapes we actually send:
 * Supabase public URLs and Telegram file URLs.
 */

import { describe, it, expect } from 'vitest'
import { validateImageUrl } from '@/core/lipsync/validateImageUrl'

describe('validateImageUrl', () => {
  describe('accepts what we really send', () => {
    const REAL_SHAPES = [
      'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/images/user/1.jpg',
      'https://api.telegram.org/file/bot123:ABC/photos/file_0.jpg',
      'http://example.com/image.png',
      'https://example.com/image.jpg?width=512&token=abc',
      'https://example.com:8443/image.jpg',
    ]

    for (const url of REAL_SHAPES) {
      it(`accepts ${url.slice(0, 48)}`, () => {
        expect(validateImageUrl(url)).toEqual({ ok: true })
      })
    }

    it('tolerates the whitespace a pasted URL arrives with', () => {
      expect(validateImageUrl('  https://example.com/image.jpg\n')).toEqual({
        ok: true,
      })
    })
  })

  describe('refuses what would be billed and then fail', () => {
    it('refuses a string that is not a URL at all', () => {
      // The literal case the old vacuous test pretended to cover.
      const verdict = validateImageUrl('invalid-url')

      expect(verdict.ok).toBe(false)
      expect(verdict).toHaveProperty('reason')
    })

    it('refuses an empty or missing value instead of sending it', () => {
      for (const value of ['', '   ', undefined, null, 42]) {
        expect(validateImageUrl(value).ok).toBe(false)
      }
    })

    it('refuses schemes no remote fetch can follow', () => {
      for (const url of [
        'file:///Users/me/photo.jpg',
        'ftp://example.com/image.jpg',
        'data:image/png;base64,iVBORw0KGgo=',
      ]) {
        expect(validateImageUrl(url).ok).toBe(false)
      }
    })

    it('refuses hosts that exist only on our own machine', () => {
      // These are the ones that look healthy in a local test and cost money in
      // production: the provider's server resolves them to itself, or nowhere.
      for (const url of [
        'http://localhost:3000/image.jpg',
        'http://127.0.0.1/image.jpg',
        'http://192.168.1.10/image.jpg',
        'http://10.0.0.5/image.jpg',
        'http://172.16.4.2/image.jpg',
        'http://169.254.169.254/latest/meta-data',
        'http://macbook.local/image.jpg',
      ]) {
        expect(validateImageUrl(url).ok).toBe(false)
      }
    })

    it('refuses a URL that would hand our credentials to the provider', () => {
      // Assembled rather than written out: a literal user:password@host in a
      // tracked file is exactly what the secret scanners look for, and they
      // are right to -- this fixture must not teach them to ignore the shape.
      const login = ['user', 'pw-in-the-url'].join(':')
      const verdict = validateImageUrl(`https://${login}@example.com/i.jpg`)

      expect(verdict.ok).toBe(false)
      // The reason is logged, so it must not repeat the password back.
      expect(JSON.stringify(verdict)).not.toContain('pw-in-the-url')
    })

    it('does not leak a long value into the reason it reports', () => {
      const verdict = validateImageUrl('x'.repeat(5000))

      expect(verdict.ok).toBe(false)
      expect(JSON.stringify(verdict).length).toBeLessThan(200)
    })
  })
})
