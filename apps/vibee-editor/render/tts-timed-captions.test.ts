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

describe('TTS timed caption contract', () => {
  it('returns timing from the same ElevenLabs response as the audio', () => {
    const audio = handler('/api/generate/audio')
    expect(audio).toContain('/with-timestamps')
    expect(audio).toContain('audio_base64')
    expect(audio).toContain('normalized_alignment')
    expect(audio).toContain('captionsFromCharacterAlignment')
    expect(audio).toContain('timed_captions')
  })

  // Kie response timing and the no-fallback policy are exercised by the
  // actual HTTP handler in audio-provider.test.ts, not a source substring.

  it('keeps script captions separate from media timing', () => {
    expect(handler('/api/ai/generate-script')).not.toContain('timed_captions')
  })
})
