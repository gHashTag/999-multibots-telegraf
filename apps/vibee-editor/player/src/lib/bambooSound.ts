/**
 * OUR SOUND IS BAMBOO.
 *
 * Owner's decision, 2026-09-21: one sound for the product, and it is a
 * bamboo knock. Until now there were two strangers: an 800 Hz sine beep in
 * the leads feed, and the remote browser engine's own chat chime.
 *
 * It is SYNTHESISED here, not downloaded: a recording from somewhere else
 * would be somebody else's sound under our name. Two strikes on a hollow
 * tube, a fourth apart and rising -- E5 then A5 -- so it reads as a
 * greeting rather than an alarm.
 *
 * Why it sounds like bamboo rather than a bell:
 *   - A tube closed at one end rings at ODD multiples of its pitch (1, 3, 5),
 *     which is the hollow "clonk" of bamboo; a bell or a sine has neither.
 *   - The partials die fast -- a tenth of a second for the fundamental, far
 *     less for the upper ones -- because wood damps where metal rings.
 *   - A short, dark burst of noise at each strike is the knock itself.
 *   - The pitch starts a hair sharp and settles, as a struck tube does.
 *
 * The file in public/sounds is GENERATED from this module
 * (scripts/make-bamboo-sound.ts) and a test holds it byte-identical to the
 * generator, so the sound has one home: these numbers.
 */

export const BRAND_SOUND_URL = '/sounds/bamboo.wav'
export const BAMBOO_SAMPLE_RATE = 44100

interface Strike {
  at: number
  pitch: number
  gain: number
}

const STRIKES: Strike[] = [
  { at: 0, pitch: 659.25, gain: 1 },
  { at: 0.11, pitch: 880, gain: 0.85 },
]

/** Closed-tube partials: ratio, loudness, decay time constant in seconds. */
const PARTIALS: Array<[number, number, number]> = [
  [1, 1, 0.13],
  [3.01, 0.3, 0.045],
  [5.04, 0.09, 0.02],
]

const LENGTH_S = 0.6
const ATTACK_S = 0.002
const PEAK = 0.7

/** A fixed-seed generator, so the file is the same on every build. */
function noise(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x80000000 - 1
  }
}

export function bambooSamples(rate = BAMBOO_SAMPLE_RATE): Float32Array {
  const out = new Float32Array(Math.round(LENGTH_S * rate))
  const rand = noise(0x7a27)

  for (const strike of STRIKES) {
    const start = Math.round(strike.at * rate)
    const phases = PARTIALS.map(() => 0)
    let dark = 0
    for (let i = start; i < out.length; i++) {
      const t = (i - start) / rate
      const attack = Math.min(1, t / ATTACK_S)
      /* Struck sharp, settling within ten milliseconds. */
      const bend = 1 + 0.02 * Math.exp(-t / 0.01)
      let v = 0
      PARTIALS.forEach(([ratio, loud, tau], k) => {
        phases[k] += (2 * Math.PI * strike.pitch * ratio * bend) / rate
        v += loud * Math.exp(-t / tau) * Math.sin(phases[k])
      })
      /* The knock: noise through a one-pole low-pass, gone in a few ms. */
      dark += 0.25 * (rand() - dark)
      v += 0.6 * Math.exp(-t / 0.0015) * dark
      out[i] += strike.gain * attack * v
    }
  }

  let max = 0
  for (const v of out) max = Math.max(max, Math.abs(v))
  const scale = max > 0 ? PEAK / max : 1
  for (let i = 0; i < out.length; i++) out[i] *= scale
  return out
}

/** 16-bit mono PCM WAV: the one format every browser plays without a codec. */
export function encodeWav(
  samples: Float32Array,
  rate = BAMBOO_SAMPLE_RATE
): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(bytes.buffer)
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i))
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((v, i) => {
    const clamped = Math.max(-1, Math.min(1, v))
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true)
  })
  return bytes
}

/**
 * Play it. A browser that will not play sound before the person has touched
 * the page refuses quietly, and that is fine: a sound is a courtesy.
 */
export function playBrandSound(): void {
  try {
    const audio = new Audio(BRAND_SOUND_URL)
    audio.volume = 0.8
    void audio.play().catch(() => undefined)
  } catch {
    /* No audio here at all. */
  }
}
