/**
 * Fetch captions from transcription API
 * ALWAYS uses API - no static fallbacks (they get out of sync)
 */

export interface Caption {
  text: string
  startMs: number
  endMs: number
  timestampMs: number
  confidence: number
}

const RENDER_SERVER_URL =
  process.env.RENDER_SERVER_URL || 'http://localhost:3333'

/**
 * Базовый адрес сервиса транскрипции: только http/https. videoUrl уходит
 * в ТЕЛО запроса (не в URL), но и сам базовый адрес валидируем —
 * конфиг из ENV не должен превращаться в произвольную схему.
 */
function transcribeEndpoint(): URL {
  const u = new URL(`${RENDER_SERVER_URL}/transcribe`)
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new Error(`недопустимая схема сервиса транскрипции: ${u.protocol}`)
  }
  return u
}

/**
 * Fetch captions from video via transcription API
 * Returns empty array if API unavailable
 */
export async function fetchCaptions(
  videoUrl: string,
  language: string = 'ru'
): Promise<Caption[]> {
  try {
    const response = await fetch(transcribeEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl, language }),
    })

    if (!response.ok) {
      console.error(`Transcription failed: ${response.statusText}`)
      return []
    }

    const data = await response.json()
    return data.captions || []
  } catch (error) {
    console.error('Failed to fetch captions:', error)
    return []
  }
}
