import { describe, expect, it } from 'vitest'

import {
  mergeAssemblyTimedCaptions,
  normalizeTimedCaptions,
} from './timedCaptions'

const aligned = [
  {
    text: 'Actual',
    startMs: 0,
    endMs: 300,
    timestampMs: 0,
    confidence: 1,
  },
  {
    text: 'voice',
    startMs: 320,
    endMs: 700,
    timestampMs: 320,
    confidence: 1,
  },
]

describe('timed caption validation', () => {
  it('normalizes only finite monotonic word timings', () => {
    expect(normalizeTimedCaptions(aligned)).toEqual(aligned)
    expect(() =>
      normalizeTimedCaptions([
        { text: 'late', startMs: 500, endMs: 700 },
        { text: 'overlap', startMs: 650, endMs: 800 },
      ])
    ).toThrow(/monotonic/)
    expect(() =>
      normalizeTimedCaptions([
        { text: 'guess', startMs: 0, endMs: Number.POSITIVE_INFINITY },
      ])
    ).toThrow(/finite/)
  })
})

describe('AI assembly caption handoff', () => {
  it('imports only actual captions for audio placed on the timeline', () => {
    expect(
      mergeAssemblyTimedCaptions({
        existing: [],
        fps: 25,
        results: [
          {
            id: 'audio-one',
            type: 'audio',
            timedCaptions: aligned,
          },
          {
            id: 'unused-audio',
            type: 'audio',
            timedCaptions: [{ text: 'unused', startMs: 0, endMs: 100 }],
          },
        ],
        placements: [
          {
            assetId: 'audio-one',
            type: 'audio',
            startFrame: 50,
          },
        ],
      })
    ).toEqual(
      aligned.map(caption => ({
        ...caption,
        startMs: caption.startMs + 2000,
        endMs: caption.endMs + 2000,
        timestampMs: caption.timestampMs + 2000,
      }))
    )
  })

  it('never replaces existing captions', () => {
    const existing = [{ text: 'Keep me', startMs: 0, endMs: 200 }]
    expect(
      mergeAssemblyTimedCaptions({
        existing,
        fps: 30,
        results: [{ id: 'audio-one', type: 'audio', timedCaptions: aligned }],
        placements: [{ assetId: 'audio-one', type: 'audio', startFrame: 0 }],
      })
    ).toBe(existing)
  })

  it('fails atomically when timing metadata is malformed', () => {
    expect(() =>
      mergeAssemblyTimedCaptions({
        existing: [],
        fps: 30,
        results: [
          {
            id: 'audio-one',
            type: 'audio',
            timedCaptions: [{ text: 'bad', startMs: -1, endMs: 10 }],
          },
        ],
        placements: [{ assetId: 'audio-one', type: 'audio', startFrame: 0 }],
      })
    ).toThrow(/non-negative/)
  })
})
