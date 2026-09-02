import { describe, expect, it } from 'vitest'

import { captionsFromCharacterAlignment } from './timedCaptions'

describe('actual TTS alignment to timed captions', () => {
  it('preserves spoken words and punctuation using provider timing', () => {
    const characters = [...'Привет, мир!']
    const starts = characters.map((_, index) => index * 0.05)
    const ends = starts.map(start => start + 0.05)

    expect(
      captionsFromCharacterAlignment({
        characters,
        character_start_times_seconds: starts,
        character_end_times_seconds: ends,
      })
    ).toEqual([
      {
        text: 'Привет,',
        startMs: 0,
        endMs: 350,
        timestampMs: 0,
        confidence: 1,
      },
      {
        text: 'мир!',
        startMs: 400,
        endMs: 600,
        timestampMs: 400,
        confidence: 1,
      },
    ])
  })

  it.each([
    {
      characters: ['a'],
      character_start_times_seconds: [],
      character_end_times_seconds: [0.1],
    },
    {
      characters: ['a'],
      character_start_times_seconds: [Number.NaN],
      character_end_times_seconds: [0.1],
    },
    {
      characters: ['a', 'b'],
      character_start_times_seconds: [0.2, 0.1],
      character_end_times_seconds: [0.3, 0.2],
    },
  ])('rejects malformed provider alignment without guessing', alignment => {
    expect(() => captionsFromCharacterAlignment(alignment)).toThrow(/alignment/)
  })
})
