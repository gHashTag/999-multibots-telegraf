export interface VoiceIdentity {
  id: string
}

/** Keep a persisted selection only when it exists in the live provider list. */
export function reconcileVoiceSelection(
  currentId: string,
  liveVoices: VoiceIdentity[]
): string {
  if (liveVoices.some(voice => voice.id === currentId)) return currentId
  return liveVoices[0]?.id || ''
}
