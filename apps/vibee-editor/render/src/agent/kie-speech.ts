/**
 * SPEECH ON KIE, AND THE VOICES IT TAKES.
 *
 * Until 2026-10-05 `/api/voices` asked ElevenLabs directly for its voice
 * list and `/api/generate/audio` tried ElevenLabs directly first. The env
 * var holds a key id, not a key, so every list request logged an error with
 * a stack and every line of speech paid a failed round trip before reaching
 * the provider that actually speaks: Kie (owner rule, kie-only skill).
 *
 * Now both go straight to Kie. The voice list is the one in @vibee/atoms
 * (`kie-voices.ts`), shared with the web player.
 */
import {
  KIE_TTS_MODEL,
  KIE_TTS_PROVIDER,
  KIE_TTS_VOICES,
  kieVoiceFor,
} from '@vibee/atoms'

/** The `/api/voices` answer. Needs no key and makes no network call. */
export function voicesAnswer() {
  return {
    success: true as const,
    voices: KIE_TTS_VOICES,
    provider: KIE_TTS_PROVIDER,
  }
}

/** The body Kie's ElevenLabs TTS takes (docs.kie.ai, multilingual-v2). */
export function kieSpeechInput(
  text: string,
  choice: { voiceId?: unknown; voiceName?: unknown; speed?: unknown } = {}
): Record<string, unknown> {
  const speed = Number(choice.speed)
  return {
    text,
    voice: kieVoiceFor(choice.voiceId, choice.voiceName),
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0,
    // The slider gives 0.5-2.0; Kie documents 0.7-1.2 for this model.
    speed: Number.isFinite(speed) ? Math.min(Math.max(speed, 0.7), 1.2) : 1,
    timestamps: false,
    previous_text: '',
    next_text: '',
    language_code: '',
  }
}

export type RunKieJob = (
  model: string,
  input: Record<string, unknown>
) => Promise<{ url: string; taskId: string }>

/**
 * Speak `text` on Kie: the reviewed model the caller asked for, else the
 * default multilingual model; when the asked model refuses, the default is
 * tried once more (the same rule the route always had for a Kie refusal).
 */
export async function speakOnKie(
  text: string,
  choice: {
    model?: string
    voiceId?: unknown
    voiceName?: unknown
    speed?: unknown
  },
  runJob: RunKieJob,
  warn: (line: string) => void = console.warn
): Promise<{ url: string; taskId: string; provider: string }> {
  const input = kieSpeechInput(text, choice)
  const asked = choice.model || KIE_TTS_MODEL
  try {
    const done = await runJob(asked, input)
    return { ...done, provider: `kie/${asked}` }
  } catch (err) {
    if (asked === KIE_TTS_MODEL) throw err
    warn(
      `Kie TTS refused (${asked}), retrying with ${KIE_TTS_MODEL}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
    const done = await runJob(KIE_TTS_MODEL, input)
    return { ...done, provider: KIE_TTS_PROVIDER }
  }
}
