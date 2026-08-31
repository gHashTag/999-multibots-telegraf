/**
 * sanitizeUrl (used by validateVideoInput for the user-typed lipSync video URL)
 * blocked localhost/127/10/172/192.168 but MISSED 169.254.169.254 (cloud
 * metadata -- the classic SSRF credential-theft target), IPv6 loopback (::1),
 * IPv4-mapped IPv6, and IPv6 private ranges; and it only ran when
 * NODE_ENV==='production' (a tunnel-exposed dev bot was fully open). This is a
 * behavioral test of the hardened blocklist (applied unconditionally now).
 */
import { describe, it, expect } from 'vitest'
import { sanitizeUrl } from '@/utils/sanitize'

describe('sanitizeUrl blocks SSRF hosts (metadata, loopback, private)', () => {
  const blocked = [
    'http://169.254.169.254/latest/meta-data/', // AWS/GCP/Azure metadata
    'http://[::1]/x', // IPv6 loopback
    'http://[::]/x', // IPv6 unspecified
    'http://[::ffff:127.0.0.1]/x', // IPv4-mapped loopback
    'http://[::ffff:169.254.169.254]/x', // IPv4-mapped metadata
    'http://localhost/x',
    'http://foo.localhost/x',
    'http://127.0.0.1/x',
    'http://10.0.0.5/x',
    'http://192.168.1.1/x',
    'http://172.16.0.1/x',
    'http://2130706433/x', // decimal-encoded 127.0.0.1 (URL normalizes it)
  ]
  for (const u of blocked) {
    it(`rejects ${u}`, () => {
      expect(() => sanitizeUrl(u, ['http', 'https'])).toThrow()
    })
  }

  const allowed = [
    'https://api.telegram.org/file/bot123/x.ogg', // the legit lipSync source
    'https://example.com/video.mp4',
    'https://fcbarcelona.com/x', // must NOT false-match the fc/fd IPv6 rule
  ]
  for (const u of allowed) {
    it(`allows ${u}`, () => {
      expect(sanitizeUrl(u, ['http', 'https'])).toBeTruthy()
    })
  }
})
