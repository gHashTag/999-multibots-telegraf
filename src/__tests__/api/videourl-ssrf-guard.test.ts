/**
 * The video-delivery webhooks must not fetch an unvalidated videoUrl server-side.
 *
 * ai-reels-callback downloads videoUrl (from the callback payload) via axios.get,
 * and kie-ai-webhook HEADs it — both are SSRF sinks (CWE-918): a crafted callback
 * with videoUrl=http://169.254.169.254/... would make the server fetch an internal
 * address. sanitizeUrl (shared blocklist: localhost / private IPv4 / link-local /
 * IPv6 loopback + IPv4-mapped, incl. 169.254 cloud metadata) must run BEFORE each
 * fetch, and redirect hops must be re-validated (a public URL can 302 to a private
 * host). Class of #1323.
 *
 * Route files reach the network (integration-only) -> structural assertions +
 * mutation.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const REELS = fs.readFileSync(
  'src/api_server/routes/ai-reels-callback.routes.ts',
  'utf8'
)
const KIE = fs.readFileSync(
  'src/api_server/routes/kie-ai-webhook.routes.ts',
  'utf8'
)

describe('video-delivery webhooks guard videoUrl against SSRF', () => {
  it('ai-reels validates videoUrl before axios.get and guards redirect hops', () => {
    expect(REELS).toMatch(
      /import \{[^}]*sanitizeUrl[^}]*\} from '@\/utils\/sanitize'/
    )
    const guard = REELS.indexOf('sanitizeUrl(videoUrl)')
    const sink = REELS.indexOf('axios.get(videoUrl')
    expect(guard, 'sanitizeUrl(videoUrl) missing').toBeGreaterThan(-1)
    expect(sink, 'axios.get(videoUrl) missing').toBeGreaterThan(-1)
    expect(guard, 'sanitize must run before the download').toBeLessThan(sink)
    expect(REELS).toMatch(/beforeRedirect:[^\n]*assertPublicRedirect/)
  })

  it('kie-ai validates videoUrl before the HEAD fetch and blocks redirect-follow', () => {
    expect(KIE).toMatch(
      /import \{[^}]*sanitizeUrl[^}]*\} from '@\/utils\/sanitize'/
    )
    const guard = KIE.indexOf('sanitizeUrl(videoUrl)')
    const sink = KIE.indexOf('fetch(videoUrl')
    expect(guard, 'sanitizeUrl(videoUrl) missing').toBeGreaterThan(-1)
    expect(sink, 'fetch(videoUrl) missing').toBeGreaterThan(-1)
    expect(guard, 'sanitize must run before the HEAD').toBeLessThan(sink)
    expect(KIE).toMatch(/method: 'HEAD',\s*redirect: 'manual'/)
  })
})
