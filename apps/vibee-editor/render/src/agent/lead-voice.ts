/**
 * A CLIENT SPEAKS WITH HER OWN VOICE (owner, 2026-09-26).
 *
 * "Use her voice from the chat": the second gift -- a short story reel about
 * her business that she can post to Instagram -- is voiced with a MiniMax
 * clone made from the voice notes SHE sent the owner. Three rules hold it:
 *
 *  1. The source is only her own voice notes in the owner's private chat
 *     with her. The tool fetches them itself over the owner's session and
 *     drops the owner's own notes in the same chat. There is no URL argument
 *     on purpose: a link could be anybody's voice.
 *  2. The clone belongs to the pair (owner, lead). audio_generate speaks with
 *     it only for that owner, only when asked `for_lead`, and hands it to the
 *     route in the `clone_voice` field -- never as a `voice_id` a person can
 *     type (minimax-voices.ts, isCloneVoiceId).
 *  3. The provider takes MP3, M4A or WAV. Telegram voice notes are OGG/Opus
 *     and short, so they are joined and re-encoded here first.
 *
 * MEASURED 2026-09-26 from the public model page: minimax/voice-cloning costs
 * $3 a clone ("around 33 outputs for $100") and "needs only 5s of audio; the
 * more audio you give, the better". The clone is made for speech-02-turbo,
 * the model our TTS leg calls (render-server.ts generateAudioViaReplicate), so
 * a clone made for another model is never asked to speak there.
 */
import { spawn } from 'child_process'

/** The provider's floor: below this a clone is refused. */
export const LEAD_VOICE_MIN_SECONDS = 5
/** Below this the clone is made, but the answer says it may sound off. */
export const LEAD_VOICE_GOOD_SECONDS = 15
/** More than this adds cost to the upload and nothing to the likeness. */
export const LEAD_VOICE_MAX_SECONDS = 180
/** How many of her newest voice notes are looked at. */
export const LEAD_VOICE_SCAN = 60

export const VOICE_CLONE_MODEL = 'minimax/voice-cloning'
/** Must be the model the TTS leg speaks with. */
export const VOICE_CLONE_TTS_MODEL = 'speech-02-turbo'
export const VOICE_CLONE_USD = 3

/** The prediction body: her joined notes, cleaned up for the clone. */
export function cloneInput(voiceFileUrl: string): Record<string, unknown> {
  return {
    voice_file: voiceFileUrl,
    model: VOICE_CLONE_TTS_MODEL,
    // Voice notes are recorded anywhere: a street, a car, a kitchen.
    need_noise_reduction: true,
    need_volume_normalization: true,
  }
}

/** The clone's id from the prediction output, or null. */
export function voiceIdOf(output: unknown): string | null {
  const raw =
    typeof output === 'string'
      ? output
      : output && typeof output === 'object'
        ? (output as { voice_id?: unknown }).voice_id
        : undefined
  return typeof raw === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(raw.trim())
    ? raw.trim()
    : null
}

type Pool = { query: (sql: string, params?: unknown[]) => Promise<any> }

let tableReady: Promise<void> | null = null

export function ensureLeadVoices(pool: Pool): Promise<void> {
  tableReady ??= pool
    .query(
      `CREATE TABLE IF NOT EXISTS lead_voices (
         owner_id   text NOT NULL,
         lead_id    text NOT NULL,
         username   text,
         voice_id   text NOT NULL,
         seconds    real,
         source_url text,
         created_at timestamptz NOT NULL DEFAULT now(),
         PRIMARY KEY (owner_id, lead_id)
       )`
    )
    .then(() => undefined)
    .catch(e => {
      tableReady = null
      throw e
    })
  return tableReady
}

/**
 * The clone of this lead's voice that THIS owner made, or null. The lead is
 * named by id or by @username; either way only the owner's own row answers.
 */
export async function leadVoiceOf(
  pool: Pool,
  owner: string,
  lead: string
): Promise<{ lead: string; voiceId: string; seconds: number } | null> {
  const key = String(lead ?? '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase()
  if (!key || !String(owner ?? '').trim()) return null
  await ensureLeadVoices(pool)
  const r = await pool.query(
    `SELECT lead_id, voice_id, seconds FROM lead_voices
      WHERE owner_id = $1 AND (lead_id = $2 OR lower(username) = $2)
      ORDER BY created_at DESC LIMIT 1`,
    [String(owner), key]
  )
  const row = r?.rows?.[0]
  return row?.voice_id
    ? {
        lead: String(row.lead_id),
        voiceId: String(row.voice_id),
        seconds: Number(row.seconds) || 0,
      }
    : null
}

/**
 * A person's OWN voice: a clone made of THEM, by whichever owner made it.
 *
 * The one-tap story (story-next.ts) runs as the client herself, so the
 * owner-scoped lookup above finds nothing -- the row is (owner, her). Her own
 * voice for her own reel is hers to use; only the caller's own id is asked
 * for here, never another person's.
 */
export async function ownVoiceOf(
  pool: Pool,
  telegramId: string
): Promise<{ voiceId: string; seconds: number } | null> {
  const id = String(telegramId ?? '').trim()
  if (!/^\d{5,15}$/.test(id)) return null
  await ensureLeadVoices(pool)
  const r = await pool.query(
    `SELECT voice_id, seconds FROM lead_voices
      WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [id]
  )
  const row = r?.rows?.[0]
  return row?.voice_id
    ? { voiceId: String(row.voice_id), seconds: Number(row.seconds) || 0 }
    : null
}

export async function saveLeadVoice(
  pool: Pool,
  row: {
    owner: string
    lead: string
    username?: string | null
    voiceId: string
    seconds: number
    sourceUrl: string
  }
): Promise<void> {
  await ensureLeadVoices(pool)
  await pool.query(
    `INSERT INTO lead_voices (owner_id, lead_id, username, voice_id, seconds, source_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (owner_id, lead_id) DO UPDATE
       SET username = EXCLUDED.username, voice_id = EXCLUDED.voice_id,
           seconds = EXCLUDED.seconds, source_url = EXCLUDED.source_url,
           created_at = now()`,
    [
      String(row.owner),
      String(row.lead),
      row.username
        ? String(row.username).replace(/^@/, '').toLowerCase()
        : null,
      row.voiceId,
      row.seconds,
      row.sourceUrl,
    ]
  )
}

/**
 * Clone on Replicate and wait for the id. Throws with the provider's words,
 * so the caller refunds and says what happened.
 */
export async function cloneOnReplicate(
  voiceFileUrl: string,
  opts: {
    token: string
    fetchImpl?: typeof fetch
    deadlineMs?: number
    pollMs?: number
  }
): Promise<string> {
  const f = opts.fetchImpl ?? fetch
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${opts.token}`,
  }
  const start = await f(
    `https://api.replicate.com/v1/models/${VOICE_CLONE_MODEL}/predictions`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ input: cloneInput(voiceFileUrl) }),
    }
  )
  if (!start.ok) {
    throw new Error(
      `voice cloning refused: ${start.status} ${(await start.text()).slice(0, 200)}`
    )
  }
  let data: any = await start.json()
  const poll: string | null = data?.urls?.get ?? null
  const deadline = Date.now() + (opts.deadlineMs ?? 180_000)
  while (
    poll &&
    data?.output == null &&
    !data?.error &&
    data?.status !== 'failed' &&
    data?.status !== 'canceled' &&
    Date.now() < deadline
  ) {
    await new Promise(r => setTimeout(r, opts.pollMs ?? 2_000))
    const next = await f(poll, { headers })
    if (!next.ok) break
    data = await next.json()
  }
  if (data?.error) {
    throw new Error(`voice cloning failed: ${String(data.error).slice(0, 200)}`)
  }
  const id = voiceIdOf(data?.output)
  if (!id) throw new Error('voice cloning gave no voice id in time')
  return id
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    p.stdout.on('data', d => (out += d))
    p.stderr.on('data', d => (err += d))
    p.on('error', reject)
    p.on('close', code =>
      code === 0
        ? resolve(out)
        : reject(new Error(`${cmd} exited ${code}: ${err.slice(-300)}`))
    )
  })
}

/** ffmpeg arguments that join the notes into one mono MP3, capped in length. */
export function joinArgs(
  inputs: readonly string[],
  output: string,
  maxSeconds = LEAD_VOICE_MAX_SECONDS
): string[] {
  const chain = inputs.map((_, i) => `[${i}:a]`).join('')
  return [
    '-nostdin',
    '-y',
    ...inputs.flatMap(p => ['-i', p]),
    '-filter_complex',
    `${chain}concat=n=${inputs.length}:v=0:a=1,aformat=channel_layouts=mono[a]`,
    '-map',
    '[a]',
    '-ac',
    '1',
    '-ar',
    '44100',
    '-t',
    String(maxSeconds),
    '-c:a',
    'libmp3lame',
    '-b:a',
    '128k',
    output,
  ]
}

/** Join her notes into one MP3 and measure it. */
export async function joinVoiceNotes(
  inputs: readonly string[],
  output: string
): Promise<number> {
  await run('ffmpeg', joinArgs(inputs, output))
  const out = await run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    output,
  ])
  return Number(out.trim()) || 0
}
