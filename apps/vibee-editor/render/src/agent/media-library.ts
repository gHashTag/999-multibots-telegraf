/**
 * THE PER-USER MEDIA LIBRARY: what a person sent, kept, seen and heard.
 *
 * Measured 2026-09-13 (code read), three holes with one shape:
 *
 *   - the business DM re-sent a client's photo / voice / file to the owner,
 *     answered with a canned sentence, and dropped the bytes (`stats.
 *     nonTextDropped++`); the agent saw "[the client sent a photo]" -- a
 *     description of a file, never the file;
 *   - the CRM ingest `.filter(m => m.message)`-ed every media message without
 *     a caption out of `crm_messages`, so the memory had holes exactly where
 *     screenshots, voice notes and briefs were sent;
 *   - the bot's agent chat DID upload files to the shelf and append marker
 *     lines, but nothing indexed them per person -- the URL lived inside one
 *     message text and "what has this person sent me" had no answer.
 *
 * This module is the single source of truth for all three surfaces: one
 * table in the same Postgres the correspondence lives in, keyed by the OWNER
 * (whose CRM / bot), the LEAD (who sent it) and OUR shelf URL.
 *
 * THE URL IS ALWAYS OURS. A Telegram file link carries the bot token in its
 * path (`api.telegram.org/file/bot<TOKEN>/...`). It must never be stored, so
 * every write refuses one outright -- the route answers 400 and this module
 * throws before the INSERT. The bot fetches the bytes and re-uploads them to
 * the shelf (`agentAttachments.ts`); the ingest downloads over MTProto and
 * puts them there itself (`s3-put.ts`).
 *
 * THE TRANSCRIPT IS WHAT MAKES IT MEMORY. A row with a URL is a fact; a row
 * with "the client said: ..." is something the seller can read tomorrow. The
 * description goes through the same provider path `chat.ts` uses for a live
 * turn -- only a provider `provider.ts` marks as seeing / hearing, only for a
 * URL on our own shelf (`media-parts.ts` rules). Video and binary documents
 * are stored but NOT read: no configured provider takes them (measured
 * 2026-09-07 in media-parts.ts), and pretending otherwise would produce a
 * confident description of nothing. Text-like documents are read as text.
 *
 * Every transcript ALSO lands in `crm_messages` under the message's own id,
 * so `crm_lead_context` and Zep see it with no new code. Nothing in this
 * module interprets third-party text; the tools frame it before the model
 * sees it.
 */

import { mirrorNow } from './crm-mirror'
import { allProviders, type Provider } from './provider'
import { usableMediaUrl } from './media-parts'

export interface Pool {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

/** The same four buckets as `agentAttachments.AttachmentKind` in the bot. */
export type MediaKind = 'image' | 'video' | 'audio' | 'file'
export const MEDIA_KINDS: readonly MediaKind[] = [
  'image',
  'video',
  'audio',
  'file',
]

export type MediaSurface = 'bot' | 'business' | 'ingest'
export const MEDIA_SURFACES: readonly MediaSurface[] = [
  'bot',
  'business',
  'ingest',
]

export interface MediaRow {
  /** Who sent it (telegram_id). For the bot surface the owner themselves. */
  lead: string
  surface: MediaSurface
  /** Telegram's message id in that chat; null when unknown. */
  msgId: number | null
  at: Date
  /** true = the owner sent it. */
  out: boolean
  kind: MediaKind
  name: string
  mime: string | null
  bytes: number | null
  /** OUR shelf URL. Never api.telegram.org. */
  url: string
  tgFileUniqueId: string | null
  caption: string | null
}

export interface StoredMedia extends MediaRow {
  id: number
  owner: string
  transcript: string | null
  transcribedAt: Date | null
}

/** Exported so the test can pin the shape without a database. */
export const USER_MEDIA_TABLE_SQL = `CREATE TABLE IF NOT EXISTS user_media (
  id bigserial PRIMARY KEY,
  owner_id text NOT NULL,
  lead_id  text NOT NULL,
  surface  text NOT NULL,
  msg_id   bigint,
  at       timestamptz NOT NULL,
  "out"    boolean NOT NULL DEFAULT false,
  kind     text NOT NULL,
  name     text NOT NULL,
  mime     text,
  bytes    bigint,
  url      text NOT NULL,
  tg_file_unique_id text,
  caption  text,
  transcript text,
  transcribed_at timestamptz,
  UNIQUE (owner_id, lead_id, url)
)`
export const USER_MEDIA_INDEX_SQL = `CREATE INDEX IF NOT EXISTS user_media_lead_at
  ON user_media (owner_id, lead_id, at DESC)`

/** Caption and name caps: third-party text, kept to a sentence. */
const NAME_CAP = 160
const CAPTION_CAP = 1000
const TRANSCRIPT_CAP = 4000
/** Text-like documents are read up to this size; bigger ones are not fetched. */
const TEXT_DOC_MAX_BYTES = 200 * 1024
/** Hard ceiling on one describe call, provider or fetch. */
const DESCRIBE_TIMEOUT_MS = 20_000

let tableReady = false
/** For tests: the next call creates the table again. */
export function forgetMediaTableForTests(): void {
  tableReady = false
}

async function ensureTable(pool: Pool): Promise<void> {
  if (tableReady) return
  await pool.query(USER_MEDIA_TABLE_SQL)
  await pool.query(USER_MEDIA_INDEX_SQL)
  tableReady = true
}

/**
 * The token guard. A Telegram file link has the bot token in its path, and
 * it is the ONE URL this table must never hold. Matched on the host, not on
 * a prefix: a link with a different scheme or a trailing path is the same
 * leak.
 */
export function isTelegramFileUrl(url: string): boolean {
  return /api\.telegram\.org/i.test(String(url ?? ''))
}

const cut = (v: unknown, max: number): string | null => {
  const s = String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
  return s || null
}

/**
 * Upsert one row. Idempotent by (owner, lead, url): the bot path and the
 * ingest may both meet the same file, and a second write keeps the first
 * row while filling a caption the first writer did not have. `fresh` is
 * true only for an INSERT -- that is what decides who gets described.
 */
export async function rememberMedia(
  pool: Pool,
  owner: string,
  row: MediaRow
): Promise<{ id: number; fresh: boolean }> {
  if (isTelegramFileUrl(row.url)) {
    throw new Error(
      'user_media: a Telegram file link carries the bot token and is never stored'
    )
  }
  if (!/^https?:\/\//i.test(row.url)) {
    throw new Error('user_media: url must be an absolute shelf URL')
  }
  if (!MEDIA_KINDS.includes(row.kind)) {
    throw new Error(`user_media: kind must be one of ${MEDIA_KINDS.join(', ')}`)
  }
  await ensureTable(pool)
  const r = await pool.query(
    `INSERT INTO user_media
       (owner_id, lead_id, surface, msg_id, at, "out", kind, name, mime, bytes, url, tg_file_unique_id, caption)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (owner_id, lead_id, url) DO UPDATE
       SET caption = COALESCE(EXCLUDED.caption, user_media.caption),
           msg_id  = COALESCE(user_media.msg_id, EXCLUDED.msg_id)
     RETURNING id, (xmax = 0) AS fresh`,
    [
      owner,
      row.lead,
      row.surface,
      Number.isFinite(row.msgId as number) ? row.msgId : null,
      row.at,
      Boolean(row.out),
      row.kind,
      cut(row.name, NAME_CAP) ?? 'file',
      cut(row.mime, 100),
      Number.isFinite(row.bytes as number) ? row.bytes : null,
      row.url,
      cut(row.tgFileUniqueId, 100),
      cut(row.caption, CAPTION_CAP),
    ]
  )
  const x = r.rows[0] ?? {}
  return { id: Number(x.id), fresh: x.fresh === true || x.fresh === 't' }
}

function rowOf(x: any): StoredMedia {
  return {
    id: Number(x.id),
    owner: String(x.owner_id),
    lead: String(x.lead_id),
    surface: x.surface as MediaSurface,
    msgId:
      x.msg_id === null || x.msg_id === undefined ? null : Number(x.msg_id),
    at: new Date(x.at),
    out: Boolean(x.out),
    kind: x.kind as MediaKind,
    name: String(x.name ?? ''),
    mime: x.mime ?? null,
    bytes: x.bytes === null || x.bytes === undefined ? null : Number(x.bytes),
    url: String(x.url),
    tgFileUniqueId: x.tg_file_unique_id ?? null,
    caption: x.caption ?? null,
    transcript: x.transcript ?? null,
    transcribedAt: x.transcribed_at ? new Date(x.transcribed_at) : null,
  }
}

const SELECT_COLUMNS =
  'id, owner_id, lead_id, surface, msg_id, at, "out", kind, name, mime, bytes, url, tg_file_unique_id, caption, transcript, transcribed_at'

/** What this person sent, newest first. */
export async function listMedia(
  pool: Pool,
  owner: string,
  lead: string,
  opts: { limit?: number; kind?: MediaKind } = {}
): Promise<StoredMedia[]> {
  await ensureTable(pool)
  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 20)), 100)
  const params: unknown[] = [owner, lead, limit]
  let where = 'owner_id = $1 AND lead_id = $2'
  if (opts.kind) {
    params.push(opts.kind)
    where += ` AND kind = $${params.length}`
  }
  const r = await pool.query(
    `SELECT ${SELECT_COLUMNS} FROM user_media
      WHERE ${where}
      ORDER BY at DESC, id DESC
      LIMIT $3`,
    params
  )
  return (r.rows as any[]).map(rowOf)
}

/** Rows nobody has tried to read yet, oldest first. */
export async function pendingTranscripts(
  pool: Pool,
  owner: string,
  lead: string,
  limit = 12
): Promise<StoredMedia[]> {
  await ensureTable(pool)
  const r = await pool.query(
    `SELECT ${SELECT_COLUMNS} FROM user_media
      WHERE owner_id = $1 AND lead_id = $2 AND transcribed_at IS NULL
      ORDER BY at ASC, id ASC
      LIMIT $3`,
    [owner, lead, Math.min(Math.max(1, Math.floor(limit)), 100)]
  )
  return (r.rows as any[]).map(rowOf)
}

/**
 * Write what was heard or seen. `null` marks the row as ATTEMPTED with
 * nothing readable (a video, a binary document, a provider that failed), so
 * `pendingTranscripts` stops offering it and a failure is not retried on
 * every send.
 */
export async function saveTranscript(
  pool: Pool,
  id: number,
  text: string | null
): Promise<void> {
  await ensureTable(pool)
  await pool.query(
    `UPDATE user_media SET transcript = $2, transcribed_at = now() WHERE id = $1`,
    [id, text ? text.slice(0, TRANSCRIPT_CAP) : null]
  )
}

/* ── describing ───────────────────────────────────────────────────────── */

const TEXT_LIKE_MIME = /^(text\/|application\/json$|application\/xml$)/i
const TEXT_LIKE_EXT = /\.(txt|md|markdown|csv|json|xml|log|yaml|yml)$/i

/** A document a model can read as plain text. */
export function isTextLikeDocument(
  mime: string | null | undefined,
  name: string | null | undefined
): boolean {
  return (
    TEXT_LIKE_MIME.test(String(mime ?? '')) ||
    TEXT_LIKE_EXT.test(String(name ?? ''))
  )
}

const PROMPTS: Record<'image' | 'audio', string> = {
  audio:
    'Transcribe this recording verbatim. Keep the original language. Output only the words spoken, nothing else.',
  image:
    'Describe in 2-3 sentences what is on the image and read any visible text verbatim. Answer in the language of the text on the image, or in Russian if there is none.',
}

/** The one provider that perceives this kind, in the configured order. */
function perceivingProvider(kind: 'image' | 'audio'): Provider | null {
  return (
    allProviders().find(p => (kind === 'image' ? p.vision : p.audio)) ?? null
  )
}

async function fetchWithDeadline(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), DESCRIBE_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ac.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function readTextDocument(url: string): Promise<string | null> {
  const r = await fetchWithDeadline(url)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const declared = Number(r.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > TEXT_DOC_MAX_BYTES) return null
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.length > TEXT_DOC_MAX_BYTES) return null
  const text = buf
    .toString('utf8')
    .replace(/\u0000/g, '')
    .trim()
  return text ? text.slice(0, TRANSCRIPT_CAP) : null
}

/**
 * Ask a perceiving provider ONE non-streaming question about the file. The
 * same wire shape `media-parts.ts` builds for a live turn: the marker text
 * as a text part, the media as `image_url` / `audio_url`. The `audio_url`
 * field name is deliberate -- see the header of media-parts.ts for the two
 * probes that found `input_audio` is accepted and ignored.
 */
async function askProvider(
  p: Provider,
  kind: 'image' | 'audio',
  url: string
): Promise<string | null> {
  const part =
    kind === 'image'
      ? { type: 'image_url', image_url: { url } }
      : { type: 'audio_url', audio_url: { url } }
  const r = await fetchWithDeadline(`${p.base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${p.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: p.model,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: PROMPTS[kind] }, part],
        },
      ],
      temperature: 0.1,
      max_tokens: 1200,
      stream: false,
    }),
  })
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    throw new Error(`${p.id} answered ${r.status}: ${body.slice(0, 160)}`)
  }
  const j: any = await r.json()
  const content = j?.choices?.[0]?.message?.content
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .map((c: any) => (typeof c?.text === 'string' ? c.text : ''))
            .join('')
        : ''
  const clean = text.trim()
  return clean ? clean.slice(0, TRANSCRIPT_CAP) : null
}

/**
 * Words for audio, a description for an image, the text of a text-like
 * document -- or null. Null is an honest answer, never an error: a missing
 * transcript must not break a send, so every failure is logged and
 * swallowed here.
 *
 * VIDEO AND BINARY DOCUMENTS RETURN NULL WITHOUT CALLING ANYONE. No
 * configured provider takes video or arbitrary files (media-parts.ts,
 * measured 2026-09-07: nemotron sees images and hears audio; z.ai takes
 * text only). The row is still kept -- the owner can open the URL -- and
 * the tool says so instead of inventing a summary.
 */
export async function describeMedia(
  url: string,
  kind: MediaKind,
  mime: string | null,
  name: string | null = null
): Promise<string | null> {
  try {
    if (kind === 'video') return null
    if (kind === 'file') {
      if (!isTextLikeDocument(mime, name)) return null
      if (isTelegramFileUrl(url)) return null
      return await readTextDocument(url)
    }
    // Only our own shelf, only an extension the provider was shown to take.
    const safe = usableMediaUrl(url, kind)
    if (!safe) return null
    const p = perceivingProvider(kind)
    if (!p) return null
    return await askProvider(p, kind, safe)
  } catch (e) {
    console.warn(
      `[media-library] could not describe ${kind} ${name ?? ''}: ${String(
        e instanceof Error ? e.message : e
      ).slice(0, 160)}`
    )
    return null
  }
}

/* ── the memory text ──────────────────────────────────────────────────── */

/**
 * The line a media message becomes in `crm_messages`. Russian inside the
 * literal because the correspondence is read in Russian by the owner; the
 * same shape on all three surfaces so a reader learns it once.
 */
export function mediaLabel(
  kind: MediaKind,
  name: string | null,
  mime: string | null
): string {
  const n = cut(name, 80)
  if (kind === 'image') return n ? `[фото: ${n}]` : '[фото]'
  if (kind === 'video') return n ? `[видео: ${n}]` : '[видео]'
  if (kind === 'audio') {
    const voice = /^audio\/ogg/i.test(String(mime ?? ''))
    return voice ? '[голосовое]' : n ? `[аудио: ${n}]` : '[аудио]'
  }
  return n ? `[файл: ${n}]` : '[файл]'
}

/** `[фото: name] caption` -- the row the ingest writes instead of dropping. */
export function mediaMessageText(
  kind: MediaKind,
  name: string | null,
  mime: string | null,
  caption: string | null
): string {
  const c = cut(caption, CAPTION_CAP)
  return c
    ? `${mediaLabel(kind, name, mime)} ${c}`
    : mediaLabel(kind, name, mime)
}

/**
 * The transcript joins the correspondence under the message's own id.
 *
 * `mirrorNow` inserts when the id is new (the caption-less voice note the
 * business path never recorded). When the row already exists -- the ingest
 * or the DM mirror wrote `[голосовое]` a moment ago -- ON CONFLICT DO
 * NOTHING would silently drop the words, so the transcript is APPENDED to
 * that row, once (guarded by `position`). The brief considered a second row
 * keyed `msg_id * 1000 + 1` and rejected it: one Telegram message, one row.
 */
export async function mirrorTranscript(
  pool: Pool,
  owner: string,
  row: Pick<
    MediaRow,
    'lead' | 'msgId' | 'at' | 'out' | 'kind' | 'name' | 'mime' | 'caption'
  >,
  transcript: string
): Promise<'inserted' | 'appended' | 'skipped'> {
  const words = transcript.trim()
  if (!words || row.msgId === null || !Number.isFinite(row.msgId))
    return 'skipped'
  const text = `${mediaMessageText(row.kind, row.name, row.mime, row.caption)}\n${words}`
  const r = await mirrorNow(pool, owner, row.lead, [
    { msgId: row.msgId, at: row.at, out: row.out, text },
  ])
  if (r.fresh > 0) return 'inserted'
  await pool.query(
    `UPDATE crm_messages
        SET text = left(text || E'\\n' || $4, 4000)
      WHERE owner_id = $1 AND lead_id = $2 AND msg_id = $3
        AND position($4 in text) = 0`,
    [owner, row.lead, row.msgId, words.slice(0, TRANSCRIPT_CAP)]
  )
  return 'appended'
}

/**
 * Describe the fresh rows one after another and mirror every transcript.
 * Sequential on purpose: a provider call per file, each with its own 20 s
 * ceiling, and a burst of twelve at once would be a burst against the same
 * key the live chat uses. Runs in the background; callers `void` it.
 */
export async function transcribeAndMirror(
  pool: Pool,
  owner: string,
  rows: Array<MediaRow & { id: number }>
): Promise<{ described: number; mirrored: number }> {
  let described = 0
  let mirrored = 0
  for (const row of rows) {
    try {
      const words = await describeMedia(row.url, row.kind, row.mime, row.name)
      await saveTranscript(pool, row.id, words)
      if (!words) continue
      described += 1
      const how = await mirrorTranscript(pool, owner, row, words)
      if (how !== 'skipped') mirrored += 1
    } catch (e) {
      console.warn(
        `[media-library] transcript for #${row.id} did not land: ${String(e).slice(0, 160)}`
      )
    }
  }
  return { described, mirrored }
}

/* ── MTProto media, for the ingest ────────────────────────────────────── */

/** Enough of gramjs' `Api.MessageMedia*` to name the file. Duck-typed on
 *  `className` so a test can hand a plain object. */
export interface MtprotoMediaLike {
  className?: string
  photo?: { sizes?: Array<{ size?: number; sizes?: number[] }> }
  document?: {
    mimeType?: string
    size?: number | bigint | { toJSNumber?: () => number }
    attributes?: Array<{
      className?: string
      voice?: boolean
      fileName?: string
      roundMessage?: boolean
    }>
  }
}

export interface MtprotoMediaInfo {
  kind: MediaKind
  name: string
  mime: string
  bytes: number | null
}

const toNumber = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'bigint') return Number(v)
  const f = (v as { toJSNumber?: () => number } | null)?.toJSNumber
  if (typeof f === 'function') return f.call(v)
  return null
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'application/pdf': 'pdf',
}

/**
 * What an MTProto message carries: a photo is JPEG; a document tells its
 * mime and, through its attributes, whether it is a voice note (`voice:
 * true`) or a named file. Anything else (a poll, a contact, a web page)
 * is null -- not this table's business.
 */
export function mtprotoMediaInfo(
  media: MtprotoMediaLike | null | undefined,
  msgId: number | null = null
): MtprotoMediaInfo | null {
  if (!media || typeof media !== 'object') return null
  const tag = msgId ?? Date.now()
  if (media.className === 'MessageMediaPhoto' || media.photo) {
    const sizes = media.photo?.sizes ?? []
    let largest: number | null = null
    for (const s of sizes) {
      const n =
        toNumber(s?.size) ??
        (Array.isArray(s?.sizes) ? Math.max(...s.sizes) : null)
      if (n !== null && (largest === null || n > largest)) largest = n
    }
    return {
      kind: 'image',
      name: `photo-${tag}.jpg`,
      mime: 'image/jpeg',
      bytes: largest,
    }
  }
  if (media.className === 'MessageMediaDocument' || media.document) {
    const d = media.document
    if (!d) return null
    const mime = String(d.mimeType || 'application/octet-stream')
    const attrs = d.attributes ?? []
    const audio = attrs.find(a => a?.className === 'DocumentAttributeAudio')
    const named = attrs.find(a => a?.className === 'DocumentAttributeFilename')
    const video = attrs.find(a => a?.className === 'DocumentAttributeVideo')
    const ext = EXT_BY_MIME[mime] || 'bin'
    let kind: MediaKind
    if (audio || mime.startsWith('audio/')) kind = 'audio'
    else if (video || mime.startsWith('video/')) kind = 'video'
    else if (mime.startsWith('image/')) kind = 'image'
    else kind = 'file'
    const prefix =
      audio?.voice === true
        ? 'voice'
        : video?.roundMessage === true
          ? 'video-note'
          : kind
    return {
      kind,
      name: cut(named?.fileName, NAME_CAP) ?? `${prefix}-${tag}.${ext}`,
      mime,
      bytes: toNumber(d.size),
    }
  }
  return null
}
