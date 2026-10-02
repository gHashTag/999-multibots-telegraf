import { describe, expect, it } from 'vitest'
import {
  END_OF_TURN_MS,
  LevelGate,
  SPEECH_ONSET_MS,
  STEADY_MS,
  TICK_MS,
  TurnClock,
  rms,
} from './vad'

/** Feed `level(t)` every tick from `from` to `to`; the judgements, by time. */
function feed(
  gate: LevelGate,
  from: number,
  to: number,
  level: (t: number) => number,
  agentTalking = false
) {
  const out: { at: number; judged: string }[] = []
  for (let t = from; t <= to; t += TICK_MS)
    out.push({ at: t, judged: gate.judge(t, level(t), true, agentTalking) })
  return out
}

/** Syllables: loud 120 ms, soft 80 ms -- the swing a voice always has. */
const speech = (t: number) => (t % 200 < 120 ? 0.3 : 0.04)
/** A fan: flat, a few per cent of wobble. */
const fan = (t: number) => 0.08 * (1 + 0.05 * Math.sin(t / 37))

describe('LevelGate: the room and the voice', () => {
  it('learns a quiet room down from its first guess', () => {
    const g = new LevelGate()
    feed(g, 0, 2000, () => 0.002)
    expect(g.floor).toBeLessThan(0.004)
  })

  it('never takes speech for the room, however long it goes on', () => {
    const g = new LevelGate()
    feed(g, 0, 1000, () => 0.002)
    const heard = feed(g, 1040, 9000, speech)
    expect(heard.some(h => h.judged === 'steady')).toBe(false)
    expect(heard.filter(h => h.judged === 'loud').length).toBeGreaterThan(100)
  })

  it('a fan that starts loud is learned as the room after STEADY_MS, not before', () => {
    const g = new LevelGate()
    feed(g, 0, 1000, () => 0.002)
    const heard = feed(g, 1040, 5000, fan)
    const steady = heard.filter(h => h.judged === 'steady')
    expect(steady).toHaveLength(1)
    expect(steady[0].at - 1040).toBeGreaterThanOrEqual(STEADY_MS - TICK_MS)
    expect(steady[0].at - 1040).toBeLessThanOrEqual(STEADY_MS + TICK_MS)
    // Loud until then; quiet after, because the fan is the floor now.
    expect(
      heard.filter(h => h.at < steady[0].at).every(h => h.judged === 'loud')
    ).toBe(true)
    expect(
      heard.filter(h => h.at > steady[0].at).every(h => h.judged === 'quiet')
    ).toBe(true)
    expect(g.floor).toBeGreaterThan(0.07)
    expect(g.floor).toBeLessThan(0.09)
  })

  it('a voice over the learned fan is still a voice', () => {
    const g = new LevelGate()
    feed(g, 0, 1000, () => 0.002)
    feed(g, 1040, 4000, fan)
    const heard = feed(g, 4040, 6000, t => fan(t) + speech(t))
    expect(heard.filter(h => h.judged === 'loud').length).toBeGreaterThan(20)
    expect(heard.some(h => h.judged === 'steady')).toBe(false)
  })

  it('with nothing heard before it, still not before STEADY_MS', () => {
    const g = new LevelGate()
    const heard = feed(g, 0, 3000, fan)
    const at = heard.find(h => h.judged === 'steady')?.at ?? -1
    expect(at).toBeGreaterThanOrEqual(STEADY_MS - TICK_MS)
  })

  it('a fan sitting right on the threshold, flickering, is learned too', () => {
    const g = new LevelGate()
    feed(g, 0, 1000, () => 0.002)
    const edge = Math.max(0.014, g.floor * 3.2)
    const heard = feed(g, 1040, 5000, t =>
      Math.floor(t / TICK_MS) % 3 ? edge * 1.1 : edge * 0.95
    )
    expect(heard.some(h => h.judged === 'steady')).toBe(true)
  })

  it('the gate before cycle 8 (no steady) kept a fan loud for ever', () => {
    const g = new LevelGate(Infinity)
    feed(g, 0, 1000, () => 0.002)
    const heard = feed(g, 1040, 31_000, fan)
    expect(heard.every(h => h.judged === 'loud')).toBe(true)
  })

  it('over the agent its own voice level is not the person', () => {
    const g = new LevelGate()
    feed(g, 0, 1000, () => 0.002)
    expect(g.judge(1040, 0.04, true, true)).toBe('quiet')
    expect(g.judge(1080, 0.04, true, false)).toBe('loud')
  })

  it('holds the floor while a phrase is under way', () => {
    const g = new LevelGate()
    feed(g, 0, 1000, () => 0.002)
    const before = g.floor
    for (let t = 1040; t < 1400; t += TICK_MS) g.judge(t, 0.004, false, false)
    expect(g.floor).toBe(before)
  })
})

describe('TurnClock', () => {
  it('a phrase begins after SPEECH_ONSET_MS of loud, once', () => {
    const c = new TurnClock()
    c.mark(1000, true)
    expect(c.onset(1000 + SPEECH_ONSET_MS)).toBe(false)
    expect(c.onset(1000 + SPEECH_ONSET_MS + 1)).toBe(true)
    expect(c.onset(1000 + SPEECH_ONSET_MS + 40)).toBe(false)
    expect(c.spoke).toBe(true)
  })

  it('ends after END_OF_TURN_MS of quiet, and only once spoken', () => {
    const c = new TurnClock()
    c.mark(1000, false)
    expect(c.ended(1000 + END_OF_TURN_MS + 1)).toBe(false)
    c.mark(2000, true)
    c.onset(2200)
    c.mark(2300, false)
    expect(c.quiet(2300 + END_OF_TURN_MS)).toBe(END_OF_TURN_MS)
    expect(c.ended(2300 + END_OF_TURN_MS)).toBe(false)
    expect(c.ended(2300 + END_OF_TURN_MS + 1)).toBe(true)
    c.reset()
    expect([c.spoke, c.loudSince, c.quietSince]).toEqual([false, 0, 0])
  })

  it('rms of a frame', () => {
    expect(rms([0.5, -0.5, 0.5, -0.5])).toBe(0.5)
    expect(rms([])).toBe(0)
  })
})
