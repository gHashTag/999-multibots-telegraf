import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * /analyze-face must not let a caller's URL freeze the service or pick its
 * destination.
 *
 * The route takes `videoUrl` straight from the request body and only treats it
 * as a local file when it starts with '/'. Everything else is handed on as an
 * INPUT URL, and ffmpeg fetches http(s) inputs itself. Two things went wrong at
 * once:
 *
 *   1. the frame extraction ran through execFileSync with NO timeout. Every bot
 *      shares this one process, so a server that accepts the connection and
 *      then trickles bytes pinned the whole event loop -- not merely that one
 *      request -- for as long as it liked;
 *   2. nothing validated the destination, so the body chose what the server
 *      connects to: the cloud metadata address and the private ranges were one
 *      POST away, in a file whose sibling routes all go through
 *      assertFetchable.
 *
 * These are source-level assertions on purpose: faceDetection.ts imports
 * face-api and canvas (native deps absent here) and the route lives inside the
 * render server, so neither can be imported without booting the world. Each
 * assertion below is mutation-checked -- reverting the fix turns it red.
 */

const RENDER_DIR = __dirname
const FACE = fs.readFileSync(
  path.join(RENDER_DIR, 'src', 'lib', 'faceDetection.ts'),
  'utf8'
)
const SERVER = fs.readFileSync(
  path.join(RENDER_DIR, 'render-server.ts'),
  'utf8'
)

/** The body of the /analyze-face handler, up to the next route. */
function analyzeFaceHandler(): string {
  const start = SERVER.indexOf("req.url === '/analyze-face'")
  expect(start, '/analyze-face handler not found').toBeGreaterThan(-1)
  const next = SERVER.indexOf('req.url === ', start + 40)
  return SERVER.slice(start, next === -1 ? start + 9000 : next)
}

describe('извлечение кадра не морозит общий процесс', () => {
  it('находит исходники — иначе проверка пустая', () => {
    expect(FACE).toContain('ffmpeg')
    expect(analyzeFaceHandler().length).toBeGreaterThan(200)
  })

  it('ffmpeg запускается асинхронно, а не блокирующим execFileSync', () => {
    // execFileSync blocks the event loop for the whole platform, and the input
    // is a remote URL chosen by the caller.
    expect(FACE).not.toMatch(/execFileSync\s*\(/)
    expect(FACE).toMatch(/execFileAsync\s*\(\s*\n?\s*'ffmpeg'/)
  })

  it('у запуска ffmpeg есть таймаут', () => {
    // A bound the child cannot outlive. Without it "async" only moves the
    // hang off the event loop; the process still accumulates them forever.
    expect(FACE).toMatch(/timeout:\s*FRAME_EXTRACT_TIMEOUT_MS/)
    expect(FACE).toMatch(/FRAME_EXTRACT_TIMEOUT_MS\s*=\s*[0-9_]+/)
  })
})

describe('адрес выбирает не тело запроса', () => {
  it('нелокальный mediaUrl проходит через assertFetchable', () => {
    const h = analyzeFaceHandler()
    expect(h).toContain('assertFetchable(mediaUrl)')
  })

  it('проверка стоит ДО обращения к медиа, а не после', () => {
    // Order is the whole point: validating after detectFaceInVideo has already
    // been called would be a comment, not a guard.
    const h = analyzeFaceHandler()
    const guard = h.indexOf('assertFetchable(mediaUrl)')
    const use = h.search(/detectFaceIn(Video|Image)\s*\(/)
    expect(guard).toBeGreaterThan(-1)
    expect(use).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(use)
  })
})
