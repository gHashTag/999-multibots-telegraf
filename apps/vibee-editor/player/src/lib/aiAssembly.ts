export type AiAssemblyAssetType = 'image' | 'video' | 'audio'

export interface AiAssemblyResult {
  id: string
  type: AiAssemblyAssetType
  timestamp: number
}

export interface AiAssemblyTrack {
  id: string
  items: Array<{
    assetId?: string
    startFrame: number
    durationInFrames: number
  }>
}

export interface AiAssemblyPlacement {
  assetId: string
  type: AiAssemblyAssetType
  trackId: 'track-image' | 'track-video' | 'track-audio'
  startFrame: number
  durationInFrames: number
}

const TRACK_BY_TYPE: Record<
  AiAssemblyAssetType,
  AiAssemblyPlacement['trackId']
> = {
  image: 'track-image',
  video: 'track-video',
  audio: 'track-audio',
}

const DEFAULT_DURATION: Record<AiAssemblyAssetType, number> = {
  image: 90,
  video: 90,
  audio: 150,
}

/** Plan a non-destructive handoff into the editor. */
export function planAiAssembly(
  results: readonly AiAssemblyResult[],
  tracks: readonly AiAssemblyTrack[]
): AiAssemblyPlacement[] {
  const usedAssets = new Set(
    tracks.flatMap(track =>
      track.items.map(item => item.assetId).filter(Boolean)
    )
  )
  const trackEnds = new Map(
    tracks.map(track => [
      track.id,
      track.items.reduce(
        (end, item) => Math.max(end, item.startFrame + item.durationInFrames),
        0
      ),
    ])
  )

  return [...results]
    .sort((a, b) => a.timestamp - b.timestamp)
    .flatMap(result => {
      if (usedAssets.has(result.id)) return []

      const trackId = TRACK_BY_TYPE[result.type]
      const startFrame = trackEnds.get(trackId) ?? 0
      const durationInFrames = DEFAULT_DURATION[result.type]
      trackEnds.set(trackId, startFrame + durationInFrames)
      usedAssets.add(result.id)

      return [
        {
          assetId: result.id,
          type: result.type,
          trackId,
          startFrame,
          durationInFrames,
        },
      ]
    })
}
