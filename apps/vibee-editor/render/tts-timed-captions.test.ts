import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const server = fs.readFileSync(path.join(__dirname, 'render-server.ts'), 'utf8')

const handler = (route: string): string => {
  const start = server.indexOf(`req.url === '${route}'`)
  expect(start, `${route} handler not found`).toBeGreaterThan(-1)
  const next = server.indexOf('req.url === ', start + route.length + 20)
  return server.slice(start, next === -1 ? start + 12_000 : next)
}

/*
 * Timed captions came only from the DIRECT ElevenLabs leg (/with-timestamps).
 * That leg never worked (the env var held a key id, not a key) and is gone:
 * Kie speaks (owner rule, kie-only skill). Kie's TTS returns no character
 * alignment, so the route must not invent one -- callers that need timing
 * transcribe the final voice (reel-captions-from-final-voice).
 */
describe('TTS timed caption contract', () => {
  it('does not fabricate timed captions without a provider alignment', () => {
    const audio = handler('/api/generate/audio')
    expect(audio).not.toContain('timed_captions')
    expect(audio).not.toContain('timedCaptions =')
    expect(audio).not.toContain('/with-timestamps')
  })

  it('keeps script captions separate from media timing', () => {
    expect(handler('/api/ai/generate-script')).not.toContain('timed_captions')
  })
})
