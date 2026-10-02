/**
 * REPLICATE IS OFF. KIE IS THE PROVIDER.
 *
 * Owner, 2026-10-02: there is no balance on Replicate, the platform runs on
 * Kie. Until then every chain still walked through Replicate -- the first
 * image leg, the TTS fallback, the video fallback, the SadTalker face, the
 * voice clone -- and each walk was a round trip ending in 402 "Insufficient
 * credit": seconds of waiting, a refusal in the log, and for the voice clone
 * a charge taken before the refusal.
 *
 * This is the one place that says so. Every Replicate call site asks
 * `replicateLive()` first and refuses at once with `REPLICATE_OFF`, so a chain
 * moves to its next leg without a network call. Turning Replicate back on is
 * a variable, not a code change: `REPLICATE_LIVE=1` on the service.
 *
 * What Kie cannot do, said plainly (probed 2026-10-02, docs.kie.ai/llms.txt):
 * Kie has no speech voice cloning. Every clone model name answers 422 "not
 * supported"; its TTS is ElevenLabs and Gemini with their own stock voices,
 * and Suno's custom voice is a singing voice. A MiniMax clone made on
 * Replicate (the owner's R8_5GW2UI4A) therefore cannot speak while Replicate
 * is off. On Kie a person's own voice is their own recorded voice notes,
 * cut on pauses and lip-synced on Kie (story-voice-notes.ts).
 */
export function replicateLive(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.REPLICATE_LIVE === '1'
}

export const REPLICATE_OFF =
  'Replicate is off (no balance, owner 2026-10-02): the platform runs on Kie'

export const CLONE_NEEDS_REPLICATE =
  'a voice clone is a MiniMax voice made on Replicate, and Replicate is off; ' +
  'Kie has no speech cloning -- the own voice on Kie is the voice notes'

/** Throws REPLICATE_OFF unless Replicate was turned back on. */
export function assertReplicateLive(env: NodeJS.ProcessEnv = process.env) {
  if (!replicateLive(env)) throw new Error(REPLICATE_OFF)
}
