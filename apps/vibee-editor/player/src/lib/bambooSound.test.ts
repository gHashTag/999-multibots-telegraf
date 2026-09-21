import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  bambooSamples,
  encodeWav,
  BAMBOO_SAMPLE_RATE,
  BRAND_SOUND_URL,
} from './bambooSound'

/**
 * OUR SOUND IS BAMBOO, AND IT HAS ONE HOME.
 *
 * The file the app and the browser window play is rendered from the numbers
 * in bambooSound.ts. If somebody edits one and not the other, this fails.
 */
const committed = readFileSync(
  join(__dirname, '..', '..', 'public', 'sounds', 'bamboo.wav')
)

describe('the file is the generator', () => {
  it('IS BYTE-IDENTICAL to what the module renders', () => {
    /* Regenerate: npx tsx scripts/make-bamboo-sound.ts */
    expect(Buffer.from(encodeWav(bambooSamples())).equals(committed)).toBe(true)
  })

  it('is served where the app and the window look for it', () => {
    expect(BRAND_SOUND_URL).toBe('/sounds/bamboo.wav')
  })
})

describe('it sounds like a knock, not an alarm', () => {
  const s = bambooSamples()
  const rms = (from: number, to: number) => {
    let sum = 0
    const a = Math.round(from * BAMBOO_SAMPLE_RATE)
    const b = Math.round(to * BAMBOO_SAMPLE_RATE)
    for (let i = a; i < b; i++) sum += s[i] * s[i]
    return Math.sqrt(sum / (b - a))
  }

  it('is short', () => {
    expect(s.length / BAMBOO_SAMPLE_RATE).toBeLessThanOrEqual(0.6)
  })

  it('never clips, and leaves headroom', () => {
    let max = 0
    for (const v of s) max = Math.max(max, Math.abs(v))
    expect(max).toBeLessThanOrEqual(0.71)
    expect(max).toBeGreaterThan(0.5)
  })

  it('STRIKES TWICE: the second knock is louder than the tail before it', () => {
    expect(rms(0.11, 0.14)).toBeGreaterThan(rms(0.08, 0.1))
  })

  it('dies away, as wood does', () => {
    expect(rms(0.5, 0.6)).toBeLessThan(rms(0, 0.05) / 10)
  })

  it('starts without a click', () => {
    expect(Math.abs(s[0])).toBeLessThan(0.01)
  })

  it('is a real WAV header', () => {
    const wav = encodeWav(new Float32Array(4))
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe('RIFF')
    expect(new TextDecoder().decode(wav.slice(8, 12))).toBe('WAVE')
    expect(wav.length).toBe(44 + 8)
  })
})
