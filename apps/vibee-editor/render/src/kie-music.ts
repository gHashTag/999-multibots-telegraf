/**
 * SUNO ON KIE: CREATE A SONG, READ ITS STATE (spec agent-neuro-kie.t27, #3924).
 *
 * Input/output only -- which model, how long a turn waits, what it costs are
 * the spec's. Kie's music is the Suno API, not the jobs API: CREATE is
 * POST /api/v1/generate and returns a taskId; the audio comes later from
 * GET /api/v1/generate/record-info (the bot's KieAiProvider.generateMusic
 * learned the same shape: data.response.sunoData[0].audioUrl).
 */
const BASE = 'https://api.kie.ai/api/v1'

type Fetch = typeof fetch

const key = () => process.env.KIE_AI_API_KEY || ''

/** Statuses Kie answers when the song will never come. */
const FAILED = new Set([
  'CREATE_TASK_FAILED',
  'GENERATE_AUDIO_FAILED',
  'CALLBACK_EXCEPTION',
  'SENSITIVE_WORD_ERROR',
])

export async function createSong(
  o: { prompt: string; instrumental: boolean; model: string; style?: string },
  fetchImpl: Fetch = fetch
): Promise<{ ok: true; taskId: string } | { ok: false; reason: string }> {
  if (!key()) return { ok: false, reason: 'KIE_AI_API_KEY is not set' }
  const r = await fetchImpl(`${BASE}/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: o.prompt,
      customMode: false,
      instrumental: o.instrumental,
      model: o.model,
      ...(o.style ? { style: o.style } : {}),
      // Kie requires a callback address; the song is read by polling.
      callBackUrl: 'https://api.kie.ai/callback',
    }),
  })
  const d: any = await r.json().catch(() => null)
  const taskId = d?.data?.taskId
  return typeof taskId === 'string' && taskId
    ? { ok: true, taskId }
    : { ok: false, reason: String(d?.msg || `HTTP ${r.status}`).slice(0, 200) }
}

export type SongState =
  | { state: 'ready'; audioUrl: string }
  | { state: 'writing' }
  | { state: 'failed'; reason: string }

export async function songState(
  taskId: string,
  fetchImpl: Fetch = fetch
): Promise<SongState> {
  if (!key()) return { state: 'failed', reason: 'KIE_AI_API_KEY is not set' }
  const r = await fetchImpl(
    `${BASE}/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
    { headers: { Authorization: `Bearer ${key()}` } }
  )
  const d: any = await r.json().catch(() => null)
  const data = d?.data
  const status = String(data?.status ?? '')
  const audioUrl = data?.response?.sunoData?.[0]?.audioUrl
  if (typeof audioUrl === 'string' && audioUrl)
    return { state: 'ready', audioUrl }
  if (FAILED.has(status) || (r.status >= 400 && r.status !== 429))
    return {
      state: 'failed',
      reason: String(
        data?.errorMessage || d?.msg || status || `HTTP ${r.status}`
      ).slice(0, 200),
    }
  return { state: 'writing' }
}
