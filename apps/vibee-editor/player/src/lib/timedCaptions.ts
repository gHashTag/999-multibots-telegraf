import type { CaptionItem } from '@vibee/atoms'

interface CaptionedResult {
  id: string
  type: string
  timedCaptions?: unknown
}

interface AudioPlacement {
  assetId: string
  type: string
  startFrame: number
}

export function normalizeTimedCaptions(value: unknown): CaptionItem[] {
  if (!Array.isArray(value)) throw new Error('timed captions must be an array')

  let previousEnd = -1
  return value.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') {
      throw new Error(`timed caption ${index} must be an object`)
    }
    const row = candidate as Record<string, unknown>
    const text = typeof row.text === 'string' ? row.text.trim() : ''
    const startMs = Number(row.startMs)
    const endMs = Number(row.endMs)
    const timestampMs =
      row.timestampMs === undefined ? startMs : Number(row.timestampMs)
    const confidence =
      row.confidence === undefined || row.confidence === null
        ? null
        : Number(row.confidence)

    if (!text) throw new Error(`timed caption ${index} text is empty`)
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      !Number.isFinite(timestampMs) ||
      (confidence !== null && !Number.isFinite(confidence))
    ) {
      throw new Error(`timed caption ${index} times must be finite`)
    }
    if (startMs < 0 || endMs <= startMs || timestampMs < 0) {
      throw new Error(`timed caption ${index} times must be non-negative`)
    }
    if (startMs < previousEnd) {
      throw new Error('timed captions must be monotonic and non-overlapping')
    }
    previousEnd = endMs

    return { text, startMs, endMs, timestampMs, confidence }
  })
}

export function optionalTimedCaptions(
  value: unknown
): CaptionItem[] | undefined {
  if (value === undefined || value === null) return undefined
  try {
    const captions = normalizeTimedCaptions(value)
    return captions.length > 0 ? captions : undefined
  } catch {
    return undefined
  }
}

/** Build captions before atom mutation; existing editor copy always wins. */
export function mergeAssemblyTimedCaptions(input: {
  existing: CaptionItem[]
  fps: number
  results: readonly CaptionedResult[]
  placements: readonly AudioPlacement[]
}): CaptionItem[] {
  if (input.existing.length > 0) return input.existing
  if (!Number.isFinite(input.fps) || input.fps <= 0) {
    throw new Error('fps must be finite and positive')
  }

  const byId = new Map(input.results.map(result => [result.id, result]))
  const imported: CaptionItem[] = []
  for (const placement of input.placements) {
    if (placement.type !== 'audio') continue
    const result = byId.get(placement.assetId)
    if (
      !result ||
      result.type !== 'audio' ||
      result.timedCaptions === undefined
    ) {
      continue
    }
    const offsetMs = Math.round((placement.startFrame / input.fps) * 1000)
    for (const caption of normalizeTimedCaptions(result.timedCaptions)) {
      imported.push({
        ...caption,
        startMs: caption.startMs + offsetMs,
        endMs: caption.endMs + offsetMs,
        timestampMs: (caption.timestampMs ?? caption.startMs) + offsetMs,
      })
    }
  }

  return normalizeTimedCaptions(imported)
}
