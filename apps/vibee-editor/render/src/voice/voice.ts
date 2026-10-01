/**
 * Voice mode: the agent hears through our own whisper and answers aloud
 * through the same self-hosted speaches service on Railway.
 *
 * WHY THIS STACK, measured inside the `whisper` pod on 2026-10-01 (48 CPU):
 *
 *   hearing   faster-whisper-large-v3-turbo   ~5.5 s for a 6 s phrase (warm)
 *
 * Re-measured 2026-10-02 after two fixes, for a 2.7 s Russian phrase:
 *
 *             4 threads (the default)     16 threads (WHISPER__CPU_THREADS)
 *   detected  8.0 s                       5.5 s
 *   language  4.2 s                       3.2 s     <- what voice mode pays
 *
 * The time barely moves with the phrase's length (2.7 s and 8.8 s of speech
 * cost the same): whisper pads every call to a 30 s window, and naming the
 * language skips a second pass over it. That is also why cutting a phrase
 * into pieces and transcribing them as they come would be SLOWER here -- each
 * piece pays the whole window. The player names the language instead.
 *
 * Nothing is in memory until something asks for it (PRELOAD_MODELS only
 * downloads), and a cold voice costs 2-5 s on its first sentence. `warm`
 * loads them before the person has finished their first phrase.
 *   RU voice  Piper ru_RU-*-medium            0.3-1.6 s per sentence
 *   EN voice  Kokoro-82M v1.0 ONNX (fp32)     2.4-3.6 s per sentence
 *             Kokoro int8 was SLOWER (6-7 s) on the same CPU, so fp32 it is.
 *
 * All of it is free and runs on a service we already pay for. Ruled out:
 * Silero/XTTS/F5/Fish (non-commercial licences) and Edge TTS (unofficial API).
 * Kokoro has no Russian, which is why the language picks the engine.
 *
 * The player speaks an answer SENTENCE BY SENTENCE as the agent writes it, so
 * the first words are heard while the rest is still being thought.
 */
import type { IncomingMessage } from 'node:http'
import { whisperBytes, whisperConfig } from '../agent/media-library'

export type VoiceLang = 'ru' | 'en'

export interface VoiceChoice {
  model: string
  voice: string
}

const PIPER_RU = (name: string) => `speaches-ai/piper-ru_RU-${name}-medium`
const KOKORO = 'speaches-ai/Kokoro-82M-v1.0-ONNX'

/** Every voice a person may pick. Anything else falls back to the default. */
export const VOICES: Record<VoiceLang, readonly string[]> = {
  ru: ['irina', 'dmitri', 'denis', 'ruslan'],
  en: ['af_heart', 'af_bella', 'am_michael', 'bf_emma', 'bm_george'],
}

export function pickVoice(lang: unknown, voice: unknown): VoiceChoice {
  const l: VoiceLang = lang === 'en' ? 'en' : 'ru'
  const list = VOICES[l]
  const v = typeof voice === 'string' && list.includes(voice) ? voice : list[0]
  return l === 'ru'
    ? { model: PIPER_RU(v), voice: v }
    : { model: KOKORO, voice: v }
}

/**
 * Where speech is synthesised. TTS_BASE_URL wins; otherwise the whisper base,
 * but only when it is our own speaches -- Groq has no /audio/speech, and
 * OpenAI's would bill per character for a feature promised to be free.
 */
export function ttsConfig(): { base: string; key: string } | null {
  const explicit = process.env.TTS_BASE_URL
  const base = (explicit || process.env.WHISPER_BASE_URL || '').replace(
    /\/+$/,
    ''
  )
  if (!base) return null
  if (!explicit && /groq\.com|openai\.com/.test(base)) return null
  const key = process.env.TTS_API_KEY || process.env.WHISPER_API_KEY || ''
  return { base, key }
}

export const MAX_SPEAK_CHARS = 600
export const MAX_UTTERANCE_BYTES = 8 * 1024 * 1024

/**
 * Text as it should be read aloud: markdown, links and emoji are not words,
 * and a TTS engine that meets `**` or a URL reads it out character by
 * character. Returns '' when nothing speakable is left.
 */
export function speakable(text: unknown): string {
  return String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_#>|~]+/g, ' ')
    .replace(/\p{Extended_Pictographic}|\u200d|\ufe0f/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SPEAK_CHARS)
}

/*
 * A small per-person budget. The routes are behind identity already; this
 * only stops one open tab from turning the shared CPU into its own.
 */
const WINDOW_MS = 60_000
const LIMITS = { speak: 90, hear: 30, warm: 20 } as const
const spent = new Map<string, { at: number; n: number }>()

export function withinBudget(
  who: string,
  kind: keyof typeof LIMITS,
  now = Date.now()
): boolean {
  const key = `${kind}:${who}`
  const row = spent.get(key)
  if (!row || now - row.at > WINDOW_MS) {
    spent.set(key, { at: now, n: 1 })
    if (spent.size > 5000) spent.clear()
    return true
  }
  row.n += 1
  return row.n <= LIMITS[kind]
}

export function resetVoiceBudgetForTests(): void {
  spent.clear()
}

/** The raw bytes of an upload, bounded the same way readBody bounds JSON. */
export function readBytes(
  req: IncomingMessage,
  maxBytes = MAX_UTTERANCE_BYTES,
  timeoutMs = 30_000
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let settled = false
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }
    const timer = setTimeout(
      () => settle(() => (req.destroy(), reject(new Error('timed out')))),
      timeoutMs
    )
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > maxBytes) {
        settle(() => (req.destroy(), reject(new Error('too large'))))
        return
      }
      chunks.push(c)
    })
    req.on('end', () => settle(() => resolve(Buffer.concat(chunks))))
    req.on('error', err => settle(() => reject(err)))
    req.on('aborted', () => settle(() => reject(new Error('aborted'))))
  })
}

const EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
}

/** A language the transcriber may be told, or nothing to let it detect. */
export function spokenLanguage(lang: unknown): VoiceLang | undefined {
  return lang === 'ru' || lang === 'en' ? lang : undefined
}

/** Which engine turned the utterance into words. */
export type Ears = 'gigaam' | 'whisper'

export interface Heard {
  text: string
  engine: Ears
}

/**
 * The Russian-only ears (deployment/gigaam), when this server has them.
 * GigaAM hears a Russian phrase in ~0.15 s where whisper takes ~2 s, because
 * it does not pad every call to a 30 s window (numbers in its server.py).
 */
export function ruEarsConfig(): { url: string; key: string } | null {
  const url = (process.env.VOICE_HEAR_RU_URL || '').replace(/\/+$/, '')
  const key = process.env.VOICE_HEAR_RU_KEY || ''
  return url && key ? { url, key } : null
}

/** GigaAM answers in ~0.2 s; past this, whisper is the faster bet. */
export const RU_EARS_TIMEOUT_MS = 4_000

async function hearRussian(
  ears: { url: string; key: string },
  bytes: Buffer
): Promise<string | null> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), RU_EARS_TIMEOUT_MS)
  try {
    const r = await fetch(`${ears.url}/hear`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${ears.key}`,
        'content-type': 'application/octet-stream',
      },
      body: new Uint8Array(bytes),
      signal: ac.signal,
    })
    if (!r.ok) {
      console.warn(`[voice] gigaam ${r.status}, falling back to whisper`)
      return null
    }
    const body = (await r.json()) as { text?: unknown }
    return typeof body.text === 'string' ? body.text.trim() : null
  } catch (e) {
    const why = ac.signal.aborted ? 'timed out' : (e as Error).message
    console.warn(`[voice] gigaam ${why}, falling back to whisper`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * One utterance to text. `null` when this server has no ears configured.
 *
 * Russian goes to GigaAM first when it is configured; any failure there --
 * refused, too long, down, slow -- falls back to whisper, so the person never
 * loses a phrase to the faster engine. An EMPTY answer from GigaAM is trusted:
 * it means nothing was said, and whisper, asked the same, tends to invent a
 * sentence out of silence. Without a language the phrase goes to whisper,
 * which detects it -- that is how the player re-learns a person's language.
 */
export async function hear(
  bytes: Buffer,
  contentType: string | undefined,
  lang?: unknown,
  timeoutMs = 45_000
): Promise<Heard | null> {
  const spoken = spokenLanguage(lang)
  const ears = spoken === 'ru' ? ruEarsConfig() : null
  if (ears) {
    const text = await hearRussian(ears, bytes)
    if (text !== null) return { text, engine: 'gigaam' }
  }
  const w = whisperConfig()
  if (!w) return null
  const type = String(contentType || 'audio/webm')
    .split(';')[0]
    .trim()
  const name = `utterance.${EXT[type] || 'webm'}`
  const words = await whisperBytes(w, bytes, type, name, timeoutMs, spoken)
  return { text: (words || '').trim(), engine: 'whisper' }
}

/**
 * What a warm-up found: `loaded` it just now, it was `ready` already, it
 * `failed`, or there is nothing of ours to warm (`none`).
 */
export type WarmState = 'loaded' | 'ready' | 'failed' | 'none'

/** speaches keeps its model admin beside /v1, not under it. */
function adminBase(base: string): string {
  return base.replace(/\/v1$/, '')
}

async function load(
  base: string,
  key: string,
  model: string,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<WarmState> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const r = await fetchImpl(`${adminBase(base)}/api/ps/${model}`, {
      method: 'POST',
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      signal: ac.signal,
    })
    // 409 is speaches saying "already loaded": exactly what we wanted.
    return r.status === 409 ? 'ready' : r.ok ? 'loaded' : 'failed'
  } catch {
    return 'failed'
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Put the transcriber and one voice in memory before they are needed. Only
 * our own speaches is warmed: a hosted whisper has no such door and is never
 * cold. Both loads run at once; neither ever throws.
 */
export async function warm(
  lang: unknown,
  voice: unknown,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 60_000
): Promise<{ hear: WarmState; speak: WarmState }> {
  const w = whisperConfig()
  const own = w && !/groq\.com|openai\.com/.test(w.base) ? w : null
  const tts = ttsConfig()
  const [hearState, speakState] = await Promise.all([
    own
      ? load(own.base, own.key, own.model, fetchImpl, timeoutMs)
      : ('none' as const),
    tts
      ? load(
          tts.base,
          tts.key,
          pickVoice(lang, voice).model,
          fetchImpl,
          timeoutMs
        )
      : ('none' as const),
  ])
  return { hear: hearState, speak: speakState }
}

export type Speech =
  | { ok: true; audio: Buffer; contentType: string }
  | { ok: false; status: number; error: string }

/** One sentence to mp3 through speaches' OpenAI-compatible /audio/speech. */
export async function speak(
  body: { text?: unknown; lang?: unknown; voice?: unknown },
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 30_000
): Promise<Speech> {
  const cfg = ttsConfig()
  if (!cfg)
    return { ok: false, status: 503, error: 'no voice engine configured' }
  const input = speakable(body.text)
  if (!input) return { ok: false, status: 400, error: 'nothing to say' }
  const { model, voice } = pickVoice(body.lang, body.voice)
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const r = await fetchImpl(`${cfg.base}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {}),
      },
      body: JSON.stringify({ model, voice, input, response_format: 'mp3' }),
      signal: ac.signal,
    })
    if (!r.ok) {
      const why = await r.text().catch(() => '')
      return {
        ok: false,
        status: 502,
        error: `voice engine ${r.status}: ${why.slice(0, 120)}`,
      }
    }
    const audio = Buffer.from(await r.arrayBuffer())
    if (!audio.length)
      return { ok: false, status: 502, error: 'voice engine returned nothing' }
    return { ok: true, audio, contentType: 'audio/mpeg' }
  } catch (e) {
    const msg = ac.signal.aborted
      ? 'voice engine timed out'
      : String((e as Error)?.message || e)
    return { ok: false, status: 504, error: msg }
  } finally {
    clearTimeout(timer)
  }
}

export function voiceStatus() {
  return {
    hear: Boolean(whisperConfig()),
    hearRu: ruEarsConfig() ? 'gigaam' : 'whisper',
    speak: Boolean(ttsConfig()),
    voices: VOICES,
  }
}
