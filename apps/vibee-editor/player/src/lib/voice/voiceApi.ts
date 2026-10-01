/**
 * The two doors of voice mode on the render server (render src/voice/voice.ts):
 * one utterance in, words out; one sentence in, mp3 out.
 */
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'
import type { Language } from '@/atoms/language'

export class VoiceHttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

export async function transcribe(
  audio: Blob,
  opts: { lang?: Language | null; signal?: AbortSignal } = {}
): Promise<string> {
  // The language, when known, saves whisper a detection pass (spokenLang.ts).
  const q = opts.lang ? `?lang=${opts.lang}` : ''
  const r = await fetch(`${API_BASE}/api/voice/transcribe${q}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': audio.type || 'audio/webm' }),
    body: audio,
    signal: opts.signal,
  })
  if (!r.ok) throw new VoiceHttpError(r.status, `transcribe ${r.status}`)
  const body = (await r.json()) as { text?: unknown }
  return typeof body.text === 'string' ? body.text.trim() : ''
}

export async function synthesize(
  text: string,
  lang: Language,
  voice: string | null,
  signal?: AbortSignal
): Promise<ArrayBuffer> {
  const r = await fetch(`${API_BASE}/api/voice/speak`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ text, lang, voice }),
    signal,
  })
  if (!r.ok) throw new VoiceHttpError(r.status, `speak ${r.status}`)
  return r.arrayBuffer()
}

/**
 * Ask the server to load the transcriber and this voice now, while the person
 * is still drawing breath: a cold voice costs its first sentence 2-5 s. Best
 * effort -- a failed warm-up only means the first phrase is slower.
 */
export async function warmVoice(
  lang: Language,
  voice: string | null
): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/voice/warm`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ lang, voice }),
    })
  } catch {
    /* the first phrase will simply load what it needs */
  }
}

export interface VoiceStatus {
  hear: boolean
  speak: boolean
  /** The server's own list (render VOICES) -- never copied here. */
  voices: Partial<Record<Language, string[]>>
}

/** What the server can do. Unreachable means "nothing", not "everything". */
export async function fetchVoiceStatus(): Promise<VoiceStatus> {
  try {
    const r = await fetch(`${API_BASE}/api/voice/status`)
    if (!r.ok) throw new Error(String(r.status))
    const b = (await r.json()) as Partial<VoiceStatus>
    return {
      hear: Boolean(b.hear),
      speak: Boolean(b.speak),
      voices: b.voices || {},
    }
  } catch {
    return { hear: false, speak: false, voices: {} }
  }
}

/** "af_heart" -> "Heart", "irina" -> "Irina". */
export function voiceLabel(id: string): string {
  const name = id.replace(/^[a-z]{2}_/, '')
  return name.charAt(0).toUpperCase() + name.slice(1)
}
