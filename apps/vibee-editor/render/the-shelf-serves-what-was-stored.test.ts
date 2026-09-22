/**
 * THE SHELF SERVES WHAT WAS STORED -- the wiring half.
 *
 * Production, 2026-09-22: a 46 322 402-byte mp4 came back from `/s3/` as
 * 16 009 894 bytes (an ffmpeg re-encode), a `.zip` answered 500
 * `{"error":"Failed to process video"}`, and `HEAD` answered 404. The
 * behaviour now lives in `src/lib/shelf-route.ts` and is tested there through
 * a real socket. What cannot be tested that way is that render-server.ts --
 * no exports, a live server at module scope -- still HANDS the route to it,
 * for both methods, so these tests read the call site, the same technique as
 * render-duration.test.ts. A revert to the inline ffmpeg branch goes red here.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SERVER = fs.readFileSync(path.join(__dirname, 'render-server.ts'), 'utf8')

/** The `if (...)` that owns `/s3/`, and the body up to its `return`. */
function shelfBlock(): string {
  const at = SERVER.indexOf("req.url?.startsWith('/s3/')")
  expect(at, 'the /s3/ route is gone from render-server.ts').toBeGreaterThan(0)
  const end = SERVER.indexOf('return\n', at)
  return SERVER.slice(at, end)
}

describe('render-server hands /s3/ to the shelf route', () => {
  it('GET and HEAD both reach serveShelfRequest with the bucket and the video outlet', () => {
    const block = shelfBlock()
    expect(block).toMatch(/req\.method === 'GET'/)
    expect(block).toMatch(/req\.method === 'HEAD'/)
    expect(block).toMatch(
      /serveShelfRequest\(req, res, \{\s*store: SHELF_STORE,\s*video: SHELF_VIDEO,\s*access: \(key, query, r\) =>\s*shelfReadAccess\(key, query, hasServerKey\(r\)\),?\s*\}\)/
    )
  })

  it('the route itself runs no ffmpeg and no longer knows the old failure', () => {
    const block = shelfBlock()
    expect(block).not.toMatch(/ffmpeg|execFile/)
    expect(SERVER).not.toContain('Failed to process video')
  })

  it('there is exactly one /s3/ route', () => {
    const routes = SERVER.match(/req\.url\?\.startsWith\('\/s3\/'\)/g) ?? []
    expect(routes).toHaveLength(1)
  })

  it('the bucket side is the real S3 stat and ranged stream', () => {
    expect(SERVER).toMatch(
      /const SHELF_STORE: ShelfStore = \{\s*stat: s3Stat,\s*open: s3OpenStream,?\s*\}/
    )
    expect(SERVER).toMatch(/probe: ffprobeJson,\s*transcode: ffmpegH264/)
  })

  it('the video outlet knows the size before it downloads: a stat and the ceiling', () => {
    // Without them a video over the ceiling is downloaded to the ceiling on
    // every request -- each ranged request of a <video>, each HEAD.
    const at = SERVER.indexOf('const SHELF_VIDEO = createShelfVideo(')
    expect(at).toBeGreaterThan(0)
    const outlet = SERVER.slice(at, SERVER.indexOf('\n})', at))
    expect(outlet).toMatch(/\bstat: s3Stat,/)
    expect(outlet).toMatch(/\bmaxBytes: SHELF_VIDEO_MAX_BYTES,/)
  })
})

describe('no new walkable key, and the owner is handed links that open', () => {
  it('every upload in render-server.ts takes its key from assetKeyFor', () => {
    // A timestamp and a file name alone is a key someone can walk; see
    // src/lib/shelf-access.ts.
    expect(SERVER).not.toMatch(/`assets\/\$\{Date\.now\(\)\}-\$\{/)
    expect(SERVER.match(/const key = assetKeyFor\(filename\)/g)?.length).toBe(2)
  })

  it('crm_lead_media and tg_fetch_media sign the URL they hand out', () => {
    const read = (p: string) => fs.readFileSync(path.join(__dirname, p), 'utf8')
    expect(read('src/agent/crm-memory-tools.ts')).toMatch(
      /url: shelfLinkFor\(x\.url\)/
    )
    expect(read('src/agent/tg-fetch-media.ts')).toMatch(
      /files: files\.map\(f =>\s*typeof f\.url === 'string' \? \{ \.\.\.f, url: shelfLinkFor\(f\.url\) \} : f\s*\)/
    )
  })
})
