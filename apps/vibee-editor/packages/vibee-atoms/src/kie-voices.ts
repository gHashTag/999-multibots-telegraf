/**
 * THE VOICES OF THE TTS WE ACTUALLY USE: Kie's ElevenLabs model.
 *
 * Kie (api.kie.ai) is the provider (owner, 2026-10-02). Its speech model
 * `elevenlabs/text-to-speech-multilingual-v2` takes `voice` as one of an
 * enumerated set of voice ids. The ids below are copied verbatim from that
 * enum, with the names and descriptions Kie gives them:
 *   https://docs.kie.ai/market/elevenlabs/text-to-speech-multilingual-v2.md
 * (read 2026-10-05). A curated subset of the 68 listed -- everyday narration
 * and conversation voices, not the pirates and cowboys.
 *
 * ONE LIST, TWO READERS. The render server answers `GET /api/voices` with
 * it and maps a chosen voice to Kie's input; the web player shows it as the
 * list it has before the first answer arrives. A copy in either place would
 * drift: that is how the player once offered `sarah`, `rachel`, `josh`, ids
 * no provider knew.
 *
 * The model is multilingual: every voice here reads Russian as well as
 * English, so no voice is marked by language.
 */
export interface KieVoice {
  id: string
  name: string
  /** `premade`: a stock voice. Other readers take anything else as a clone. */
  category: 'premade'
  labels: { gender: 'male' | 'female'; description: string }
  preview_url: string
}

/** The provider, as the server names it in the `/api/voices` answer. */
export const KIE_TTS_MODEL = 'elevenlabs/text-to-speech-multilingual-v2'
export const KIE_TTS_PROVIDER = `kie/${KIE_TTS_MODEL}`

// Kie's docs: a voice can be heard at this address, by its id.
const preview = (id: string) =>
  `https://static.aiquickdraw.com/elevenlabs/voice/${id}.mp3`

const voice = (
  id: string,
  name: string,
  gender: 'male' | 'female',
  description: string
): KieVoice => ({
  id,
  name,
  category: 'premade',
  labels: { gender, description },
  preview_url: preview(id),
})

/** First is the default: it is the enum's own `default` in Kie's schema. */
export const KIE_TTS_VOICES: readonly KieVoice[] = [
  voice('EkK5I93UQWFDigLMpZcX', 'James', 'male', 'Husky, Engaging and Bold'),
  voice(
    'hpp4J3VqNfWAUOO0d1Us',
    'Bella',
    'female',
    'Professional, Bright, Warm'
  ),
  voice(
    'nPczCjzI2devNBz1zQrb',
    'Brian',
    'male',
    'Deep, Resonant and Comforting'
  ),
  voice(
    '5l5f8iK3YPeGga21rQIX',
    'Adeline',
    'female',
    'Feminine and Conversational'
  ),
  voice('UgBBYS2sOqTuMpoF3BR0', 'Mark', 'male', 'Natural Conversations'),
  voice('6aDn1KB0hjpdcocrUkmq', 'Tiffany', 'female', 'Natural and Welcoming'),
  voice('DYkrAHD8iwork3YSUBbs', 'Tom', 'male', 'Conversations & Books'),
  voice('lcMyyd2HUfFzxdCaC4Ta', 'Lucy', 'female', 'Fresh & Casual'),
  voice('LruHrtVF6PSyGItzMNHS', 'Benjamin', 'male', 'Deep, Warm, Calming'),
  voice(
    '1wGbFxmAM3Fgw63G1zZJ',
    'Allison',
    'female',
    'Calm, Soothing and Meditative'
  ),
  voice('x70vRnQBMBu4FAYhjJbO', 'Nathan', 'male', 'Virtual Radio Host'),
  voice(
    'BZgkqPqms7Kj9ulSkVzn',
    'Eve',
    'female',
    'Authentic, Energetic and Happy'
  ),
  voice(
    'TX3LPaxmHKxFdv7VOQHJ',
    'Liam',
    'male',
    'Energetic, Social Media Creator'
  ),
  voice('56AoDkrOh6qfVPDXZ7Pt', 'Cassidy', 'female', 'Crisp, Direct and Clear'),
]

export const KIE_TTS_DEFAULT_VOICE = KIE_TTS_VOICES[0].id

const BY_ID = new Map(KIE_TTS_VOICES.map(v => [v.id, v.id]))
const BY_NAME = new Map(KIE_TTS_VOICES.map(v => [v.name.toLowerCase(), v.id]))

/**
 * The Kie voice id for what a caller sent: an id from the list, else a name
 * from the list ("Bella"), else the default. A string Kie does not know
 * (an old MiniMax id from a cached list, a sentence) is never forwarded:
 * Kie would refuse it after the charge.
 */
export function kieVoiceFor(voiceId: unknown, voiceName?: unknown): string {
  if (typeof voiceId === 'string' && BY_ID.has(voiceId.trim())) {
    return voiceId.trim()
  }
  if (typeof voiceName === 'string') {
    const byName = BY_NAME.get(voiceName.trim().toLowerCase())
    if (byName) return byName
  }
  return KIE_TTS_DEFAULT_VOICE
}
