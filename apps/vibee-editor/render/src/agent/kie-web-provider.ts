export const KIE_WEB_MODEL = Object.freeze({
  image: 'google/nano-banana',
  video: 'grok-imagine/text-to-video',
  audio: 'elevenlabs/text-to-speech-multilingual-v2',
  lipsync: 'veed/fabric-1',
})

export type KieWebMediaKind = keyof typeof KIE_WEB_MODEL

/**
 * The browser sends an explicit provider namespace. Only the one reviewed
 * model per media stage may cross the paid provider boundary.
 */
export function reviewedKieModel(
  kind: KieWebMediaKind,
  requested: unknown
): string | null {
  if (typeof requested !== 'string' || !requested.startsWith('kie/')) {
    return null
  }
  const model = requested.slice(4)
  if (model !== KIE_WEB_MODEL[kind]) {
    throw new Error(`Kie.ai model is not enabled for ${kind}`)
  }
  return model
}
