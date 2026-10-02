/**
 * `tri vad`: run the voice-activity gate of src/lib/voice/vad.ts over real
 * recordings, tick by tick as the session does, and print what it decided.
 *
 *   bun scripts/vad-bench.ts [--legacy] file.wav ...
 *
 * Each file must be 16-bit PCM mono (tri makes them with ffmpeg at 48 kHz,
 * the rate an AnalyserNode usually runs at). The browser's own noise
 * suppression is NOT applied here: this is the gate's worst case.
 *
 * Per file: every onset, turn end, steady room learned, phrase dropped as
 * noise; and the FLATTEST two seconds of loud audio (`spread`, loudest tick
 * over quietest) -- for speech this must stay well above STEADY_SPREAD.
 */
import { readFileSync } from 'node:fs'
import {
  LevelGate,
  STEADY_MS,
  STEADY_SPREAD,
  TICK_MS,
  TurnClock,
  rms,
} from '../src/lib/voice/vad'

const FFT = 2048
const MAX_UTTERANCE_MS = 30_000

function readWav(path: string): { rate: number; samples: Float32Array } {
  const b = readFileSync(path)
  if (b.toString('ascii', 0, 4) !== 'RIFF')
    throw new Error(`${path}: not a wav`)
  let at = 12
  let rate = 0
  let bits = 0
  let channels = 0
  while (at + 8 <= b.length) {
    const id = b.toString('ascii', at, at + 4)
    const size = b.readUInt32LE(at + 4)
    if (id === 'fmt ') {
      channels = b.readUInt16LE(at + 10)
      rate = b.readUInt32LE(at + 12)
      bits = b.readUInt16LE(at + 22)
    } else if (id === 'data') {
      if (bits !== 16 || channels !== 1)
        throw new Error(
          `${path}: need 16-bit mono, got ${bits}-bit x${channels}`
        )
      const n = Math.min(size, b.length - at - 8) >> 1
      const samples = new Float32Array(n)
      for (let i = 0; i < n; i++)
        samples[i] = b.readInt16LE(at + 8 + i * 2) / 32768
      return { rate, samples }
    }
    at += 8 + size + (size & 1)
  }
  throw new Error(`${path}: no data chunk`)
}

function run(path: string, legacy: boolean): void {
  const { rate, samples } = readWav(path)
  const gate = new LevelGate(legacy ? Infinity : STEADY_MS)
  const clock = new TurnClock()
  const events: string[] = []
  const levels: { at: number; level: number; loud: boolean }[] = []
  let phraseAt = 0
  let flattest = Infinity
  const s = (ms: number) => (ms / 1000).toFixed(2) + 's'
  const end = (samples.length / rate) * 1000
  for (let now = TICK_MS; now <= end; now += TICK_MS) {
    const stop = Math.floor((now / 1000) * rate)
    const level = rms(samples.subarray(Math.max(0, stop - FFT), stop))
    const judged = gate.judge(now, level, !clock.spoke, false)
    levels.push({ at: now, level, loud: judged !== 'quiet' })
    while (now - levels[0].at > STEADY_MS) levels.shift()
    if (judged !== 'quiet' && now - levels[0].at >= STEADY_MS - TICK_MS) {
      let lo = Infinity
      let hi = 0
      for (const l of levels) {
        lo = Math.min(lo, l.level)
        hi = Math.max(hi, l.level)
      }
      flattest = Math.min(flattest, lo ? hi / lo : Infinity)
    }
    if (judged === 'steady') {
      events.push(
        `${s(now)} steady room learned (floor ${gate.floor.toFixed(4)})` +
          (clock.spoke ? `, the ${s(now - phraseAt)} "phrase" dropped` : '')
      )
      // The session starts a new recording: the noise's phrase is gone.
      clock.reset()
      continue
    }
    clock.mark(now, judged === 'loud')
    if (clock.onset(now)) {
      phraseAt = clock.loudSince
      events.push(`${s(now)} onset`)
    }
    if (clock.ended(now)) {
      events.push(`${s(now)} turn end, phrase ${s(now - phraseAt)}`)
      clock.reset()
    } else if (clock.spoke && now - phraseAt > MAX_UTTERANCE_MS) {
      events.push(`${s(now)} CAP: heard as one ${s(MAX_UTTERANCE_MS)} phrase`)
      clock.reset()
    }
  }
  if (clock.spoke) events.push(`${s(end)} still "talking" when the file ended`)
  const spread = flattest === Infinity ? '-' : flattest.toFixed(2)
  const flag = flattest < STEADY_SPREAD ? ' (flat: room)' : ''
  console.log(
    `${path.split('/').pop()}  ${s(end)}  spread ${spread}${flag}  floor ${gate.floor.toFixed(4)}`
  )
  for (const e of events) console.log(`    ${e}`)
}

const args = process.argv.slice(2)
const legacy = args.includes('--legacy')
for (const f of args.filter(a => a !== '--legacy')) run(f, legacy)
