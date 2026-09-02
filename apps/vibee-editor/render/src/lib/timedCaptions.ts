export interface CharacterAlignment {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}

export interface TimedCaption {
  text: string
  startMs: number
  endMs: number
  timestampMs: number
  confidence: number
}

const milliseconds = (seconds: number): number => Math.round(seconds * 1000)

/** Convert the provider's actual character timing into editor word ranges. */
export function captionsFromCharacterAlignment(
  alignment: CharacterAlignment
): TimedCaption[] {
  const {
    characters,
    character_start_times_seconds,
    character_end_times_seconds,
  } = alignment
  if (
    !Array.isArray(characters) ||
    characters.length === 0 ||
    character_start_times_seconds.length !== characters.length ||
    character_end_times_seconds.length !== characters.length
  ) {
    throw new Error('alignment arrays must be non-empty and equal length')
  }

  let previousStart = -1
  for (let index = 0; index < characters.length; index += 1) {
    const start = character_start_times_seconds[index]
    const end = character_end_times_seconds[index]
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      throw new Error('alignment times must be finite')
    }
    if (start < 0 || end <= start || start < previousStart) {
      throw new Error('alignment times must be non-negative and monotonic')
    }
    previousStart = start
  }

  const captions: TimedCaption[] = []
  let text = ''
  let startIndex = -1

  const flush = (endIndex: number) => {
    if (startIndex < 0 || text.length === 0) return
    const startMs = milliseconds(character_start_times_seconds[startIndex])
    const endMs = milliseconds(character_end_times_seconds[endIndex])
    captions.push({
      text,
      startMs,
      endMs,
      timestampMs: startMs,
      confidence: 1,
    })
    text = ''
    startIndex = -1
  }

  characters.forEach((character, index) => {
    if (/\s/u.test(character)) {
      flush(index - 1)
      return
    }
    if (startIndex < 0) startIndex = index
    text += character
  })
  flush(characters.length - 1)

  return captions
}
