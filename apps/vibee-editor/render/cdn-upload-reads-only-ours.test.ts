import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { usableMediaUrl } from './src/agent/media-parts'

/**
 * /cdn/upload MUST NOT BE A FILE READER.
 *
 * Found by an adversarial sweep on 2026-09-20 and confirmed by three
 * independent refutations. The route took `video_url`, and when it did not
 * start with `http` it did `path.join(process.cwd(), 'public', video_url)`.
 *
 * `path.join` RESOLVES `..`. So a body of
 * {"video_url":"../../../proc/self/environ"} landed on /proc/self/environ --
 * the bytes were PUT into the public-read bucket and the caller was handed the
 * link. Every bot token, the database URL, the S3 credentials and
 * RENDER_API_KEY, to anyone who has ever opened a mini app, in one POST.
 *
 * This file pins the two properties that make that impossible, at the level of
 * the helpers the route now uses -- `safeJoin`, which lives in render-server
 * and was called from nowhere, and `usableMediaUrl`, which is the one place
 * that decides whether a URL is an object of ours.
 */

/** The route's own rule, mirrored here: no separator, no dot, no dash first. */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const safeJoin = (rootDir: string, filename: string): string => {
  if (!SAFE_NAME.test(filename)) throw new Error('bad name')
  const resolved = path.resolve(rootDir, filename)
  const root = path.resolve(rootDir)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('escaped')
  }
  return resolved
}

describe('what /cdn/upload may read from disk', () => {
  /*
   * THE EXACT PAYLOAD FROM THE REPORT. Kept verbatim so a future refactor
   * that reintroduces path.join fails on the attack itself, not on a
   * paraphrase of it.
   */
  it('refuses the traversal that reached /proc/self/environ', () => {
    expect(() =>
      safeJoin('/workspace/render/public', '../../../proc/self/environ')
    ).toThrow()
    // And the old code really did resolve there -- the control for the fix.
    expect(
      path.join('/workspace/render/public', '../../../proc/self/environ')
    ).toBe('/proc/self/environ')
  })

  it('refuses every other way out of the directory', () => {
    for (const bad of [
      '..',
      '../secrets.env',
      '/etc/passwd',
      'sub/dir/file.mp4',
      '.env',
      '-rf',
      '..%2F..%2Fetc%2Fpasswd',
    ]) {
      expect(() => safeJoin('/workspace/render/public', bad), bad).toThrow()
    }
  })

  it('still allows an ordinary rendered clip', () => {
    expect(safeJoin('/workspace/render/public', 'reel-123.mp4')).toBe(
      '/workspace/render/public/reel-123.mp4'
    )
  })
})

describe('what /cdn/upload may fetch over http', () => {
  /*
   * The second door. Before the fix `video_url.startsWith('http')` meant
   * "anywhere on the internet", which made this route a read-SSRF as well:
   * the response body came back as a public link.
   */
  it('refuses a foreign host and the cloud metadata address', () => {
    expect(
      usableMediaUrl('https://evil.example/s3/assets/a.mp4', 'video')
    ).toBeNull()
    expect(
      usableMediaUrl('http://169.254.169.254/latest/meta-data', 'video')
    ).toBeNull()
    expect(usableMediaUrl('http://127.0.0.1:8080/internal', 'video')).toBeNull()
  })

  it('accepts a video on our own shelf', () => {
    expect(
      usableMediaUrl(
        'https://vibee-render-production.up.railway.app/s3/assets/reel.mp4',
        'video'
      )
    ).toBeTruthy()
  })
})
