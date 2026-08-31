/**
 * WHO DECIDES HOW LONG A TEMPLATE RENDER IS.
 *
 * THE DEFECT THIS REPLACES. /render/template opened with
 * `let durationInFrames = 900` and closed with an UNCONDITIONAL
 * `composition.durationInFrames = durationInFrames`. The 900 was only ever
 * replaced when the clip was a LOCAL file (`fs.existsSync(videoPath)`), and the
 * whole block read `request.lipSyncVideo` from the top level of the body while
 * reel_render sends only `{compositionId, props}` (src/agent/tools.ts:1032).
 * So for every render the agent starts, nothing measured anything and the
 * hardcoded 900 overwrote what Root.tsx's calculateMetadata had just computed
 * from the video's real metadata.
 *
 * Measured consequence: feed id 20, the one SplitTalkingHead reel this factory
 * ever published, is a 3.20 s clip published as 30.06 s -- 900 frames at 30 fps
 * -- of the same freeze-frame. Every log line said success.
 *
 * THE RULE. An override is only legitimate when something was actually
 * measured. When nothing was, the answer already sitting on the composition --
 * produced by calculateMetadata, which reads the video's own metadata over
 * http too -- is better than any constant we could invent. So this returns
 * null for "leave it alone", and null is not the same as zero.
 */

/** Every composition in Root.tsx is registered at 30 fps. */
export const DEFAULT_FPS = 30

export interface DurationInput {
  /**
   * Seconds measured from the actual media, or null/undefined/0 when no
   * measurement was possible (remote URL, missing ffprobe, no clip at all).
   */
  measuredSeconds?: number | null
  fps?: number
}

/**
 * Frames to force onto the composition, or null to keep what
 * calculateMetadata decided.
 */
export function templateDurationInFrames(input: DurationInput): number | null {
  const { measuredSeconds } = input
  const fps = input.fps && input.fps > 0 ? input.fps : DEFAULT_FPS
  if (
    typeof measuredSeconds !== 'number' ||
    !Number.isFinite(measuredSeconds) ||
    measuredSeconds <= 0
  ) {
    return null
  }
  return Math.ceil(measuredSeconds * fps)
}

/**
 * The clip URL a template render is about.
 *
 * Two callers, one meaning. The HTTP body may carry it at the top level (the
 * mini-app posts it that way) or inside `props` (every agent render does,
 * because reel_render only ever sends compositionId and props). Reading only
 * the first is what made the duration, face-crop and default-segment code dead
 * for the agent path.
 */
export function lipSyncVideoOf(request: {
  lipSyncVideo?: unknown
  props?: Record<string, unknown> | null
}): string | undefined {
  if (typeof request.lipSyncVideo === 'string' && request.lipSyncVideo.length) {
    return request.lipSyncVideo
  }
  const fromProps = request.props?.lipSyncVideo
  if (typeof fromProps === 'string' && fromProps.length) return fromProps
  return undefined
}
