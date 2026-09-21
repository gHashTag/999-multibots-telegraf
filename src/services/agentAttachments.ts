/**
 * TELEGRAM ATTACHMENTS FOR THE AGENT CHAT.
 *
 * Owner, 2026-09-07: "you must be able to send any file format from Telegram,
 * full API support".
 *
 * WHAT WAS BROKEN
 *
 * The bot's agent path accepted TEXT and nothing else: the fallback middleware
 * in `registerCommands.ts` starts with `if (!ctx.message || !('text' in
 * ctx.message)) return next()`, and the only global media handler
 * (`bot.on(message('photo'))`) routes a photo to FLUX Kontext or to a wizard
 * and otherwise ends with a "skipping" log and NO `next()`. So a photo sent
 * into the agent chat stopped the middleware chain and produced no answer at
 * all -- not an error, not a hint, nothing. Documents, video, voice, audio,
 * video notes and animations had no handler whatsoever.
 *
 * HOW THE MINI APP ALREADY DOES IT, AND WHY WE COPY IT EXACTLY
 *
 * The agent's message type is text-only: `content: string | null` in
 * `apps/vibee-editor/render/src/agent/chat.ts`. There are no multimodal parts.
 * The mini app therefore uploads a file to our own shelf and appends ONE line
 * per attachment to the message text:
 *
 *     [attached image: portrait.jpg; mime=image/jpeg; url=https://.../x.jpg]
 *
 * That shape is produced by `messageContentForAgent` in
 * `apps/vibee-editor/player/src/lib/agentStream.ts`. It is a convention read by
 * the MODEL -- nothing parses it -- so the two producers must agree by
 * discipline. `attachmentLine` below is the bot's copy, and
 * `agent-attachments.test.ts` pins the exact string. If you change one, change
 * both, or the model starts seeing two dialects of the same fact.
 *
 * WHY THE TELEGRAM FILE URL NEVER LEAVES THIS MODULE
 *
 * `getFileLink` returns `https://api.telegram.org/file/bot<TOKEN>/...` -- the
 * bot token is IN the path. Putting that link into the message would write the
 * token into `agent_messages` (a table the mini app reads back and renders) and
 * send it to a third-party model. So the bytes are fetched here and re-uploaded
 * to our own shelf, and only our own URL is ever returned.
 *
 * THE CEILING BELONGS TO THE BOT'S SERVER, NOT TO US
 *
 * The cloud Bot API refuses `getFile` for anything larger than 20 MB, while
 * the mini app accepts 100 MB. A bot moved to our own Bot API server
 * (BOT_API_LOCAL_BOTS, see services/telegramApi.ts) is handed up to 2000 MB,
 * and then our shelf's 100 MB is the limit -- the same as the mini app's. The
 * ceiling is therefore read per bot, from the token, every time; a file over
 * it is refused with a sentence a person can act on, because the failure mode
 * we are replacing is silence.
 */

import { logger } from '@/utils/logger'
import { putBytes } from '@/services/contentFactory/storage'
import { SHELF_UPLOAD_LIMIT } from '@/services/contentFactory/shelfLimit'
import { albumCaption } from '@/services/albumBuffer'
import {
  CLOUD_DOWNLOAD_LIMIT,
  botApiIsLocalFor,
  telegramDownloadLimitFor,
} from '@/services/telegramApi'
import {
  TelegramFileDownloadFailed,
  TelegramFileTooBig,
  mirrorTelegramFile,
} from '@/services/telegramFiles'

/** The four buckets the mini app uses. Keep them identical: same vocabulary. */
export type AttachmentKind = 'image' | 'video' | 'audio' | 'file'

export interface TelegramAttachment {
  kind: AttachmentKind
  /** What to call it for a human. Never empty. */
  name: string
  mimeType: string
  fileId: string
  /** Stable across bots and re-sends; the library keys a duplicate by it. */
  fileUniqueId: string | null
  /** Telegram's own size, when it tells us. Null when it does not. */
  bytes: number | null
}

/**
 * The CLOUD Bot API download ceiling.
 *
 * Not a policy of ours and not tunable: `getFile` answers "file is too big" for
 * anything above it, so checking earlier only changes WHO explains it. A bot on
 * our own server has a different one: refusals read
 * `telegramDownloadLimitFor(token)`, never this constant.
 */
export const TELEGRAM_DOWNLOAD_LIMIT = CLOUD_DOWNLOAD_LIMIT

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'application/pdf': 'pdf',
}

function nameFor(prefix: string, uniqueId: string, mime: string): string {
  const ext = EXTENSION_BY_MIME[mime] || 'bin'
  return `${prefix}-${uniqueId}.${ext}`
}

function kindOf(mime: string): AttachmentKind {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'file'
}

/**
 * Recognise whatever file the message carries.
 *
 * Ordered by how specific the field is, not alphabetically: a Telegram message
 * can satisfy more than one of these at once (an animation also has a
 * `document`, a video note is not a video), and the first match must be the
 * most precise description of what the person actually sent.
 *
 * Returns null when the message carries no file at all -- plain text, a
 * location, a poll. Those are not this module's business.
 */
export function attachmentFromMessage(message: any): TelegramAttachment | null {
  if (!message || typeof message !== 'object') return null

  // Photo is an ARRAY of sizes, smallest first. The last is the largest, and
  // it is the only one worth showing a model: the first is a thumbnail of a
  // few hundred pixels, on which nothing can be read.
  if (Array.isArray(message.photo) && message.photo.length) {
    const largest = message.photo[message.photo.length - 1]
    return {
      kind: 'image',
      name: nameFor('photo', largest.file_unique_id, 'image/jpeg'),
      mimeType: 'image/jpeg',
      fileId: largest.file_id,
      fileUniqueId: largest.file_unique_id ?? null,
      bytes: Number.isFinite(largest.file_size) ? largest.file_size : null,
    }
  }

  // An animation (a GIF, delivered as a silent mp4) also appears as
  // `document`, so it must be checked BEFORE it.
  if (message.animation?.file_id) {
    const a = message.animation
    const mime = a.mime_type || 'video/mp4'
    return {
      kind: 'video',
      name: a.file_name || nameFor('animation', a.file_unique_id, mime),
      mimeType: mime,
      fileId: a.file_id,
      fileUniqueId: a.file_unique_id ?? null,
      bytes: Number.isFinite(a.file_size) ? a.file_size : null,
    }
  }

  if (message.video?.file_id) {
    const v = message.video
    const mime = v.mime_type || 'video/mp4'
    return {
      kind: 'video',
      name: v.file_name || nameFor('video', v.file_unique_id, mime),
      mimeType: mime,
      fileId: v.file_id,
      fileUniqueId: v.file_unique_id ?? null,
      bytes: Number.isFinite(v.file_size) ? v.file_size : null,
    }
  }

  // A round video note has no mime_type and no file_name at all.
  if (message.video_note?.file_id) {
    const v = message.video_note
    return {
      kind: 'video',
      name: nameFor('video-note', v.file_unique_id, 'video/mp4'),
      mimeType: 'video/mp4',
      fileId: v.file_id,
      fileUniqueId: v.file_unique_id ?? null,
      bytes: Number.isFinite(v.file_size) ? v.file_size : null,
    }
  }

  if (message.voice?.file_id) {
    const v = message.voice
    const mime = v.mime_type || 'audio/ogg'
    return {
      kind: 'audio',
      name: nameFor('voice', v.file_unique_id, mime),
      mimeType: mime,
      fileId: v.file_id,
      fileUniqueId: v.file_unique_id ?? null,
      bytes: Number.isFinite(v.file_size) ? v.file_size : null,
    }
  }

  if (message.audio?.file_id) {
    const a = message.audio
    const mime = a.mime_type || 'audio/mpeg'
    // A track usually knows its own title; that reads far better in the feed
    // than a generated identifier.
    const title = [a.performer, a.title].filter(Boolean).join(' - ')
    return {
      kind: 'audio',
      name: a.file_name || title || nameFor('audio', a.file_unique_id, mime),
      mimeType: mime,
      fileId: a.file_id,
      fileUniqueId: a.file_unique_id ?? null,
      bytes: Number.isFinite(a.file_size) ? a.file_size : null,
    }
  }

  if (message.sticker?.file_id) {
    const s = message.sticker
    // A static sticker is a WebP image and a model can look at it. An animated
    // one (.tgs) is gzipped Lottie JSON and a video one is WebM: neither is an
    // image, so they travel as plain files rather than pretending to be one.
    const mime = s.is_animated
      ? 'application/gzip'
      : s.is_video
        ? 'video/webm'
        : 'image/webp'
    return {
      kind: kindOf(mime),
      name: nameFor('sticker', s.file_unique_id, mime),
      mimeType: mime,
      fileId: s.file_id,
      fileUniqueId: s.file_unique_id ?? null,
      bytes: Number.isFinite(s.file_size) ? s.file_size : null,
    }
  }

  // Document is LAST because it is the catch-all: Telegram files anything it
  // has no special type for under it, including any format we have never heard
  // of. That is exactly what "any file format" means here.
  if (message.document?.file_id) {
    const d = message.document
    const mime = d.mime_type || 'application/octet-stream'
    return {
      kind: kindOf(mime),
      name: d.file_name || nameFor('document', d.file_unique_id, mime),
      mimeType: mime,
      fileId: d.file_id,
      fileUniqueId: d.file_unique_id ?? null,
      bytes: Number.isFinite(d.file_size) ? d.file_size : null,
    }
  }

  return null
}

/**
 * The exact line the mini app produces. See the header: this is a copy by
 * necessity, pinned by a test.
 *
 * The sanitising matters. A file name may contain a newline or a bracket, and
 * either would break the one-line-per-attachment convention the model relies
 * on -- a name like "report].jpg" would close the marker early and the rest
 * would read as prose.
 */
export function attachmentLine(a: {
  kind: AttachmentKind
  name: string
  mimeType: string
  url: string
}): string {
  const oneLine = (value: string, limit: number) =>
    String(value ?? '')
      .replace(/[\r\n[\]]+/g, ' ')
      .trim()
      .slice(0, limit)
  return `[attached ${a.kind}: ${oneLine(a.name, 160)}; mime=${oneLine(
    a.mimeType,
    100
  )}; url=${oneLine(a.url, 2_048)}]`
}

export interface AttachmentStored {
  ok: true
  line: string
  kind: AttachmentKind
  bytes: number
  /*
   * Enough to index the file per person (media library) without parsing the
   * marker line back. The URL is OURS -- the shelf's -- never Telegram's.
   */
  name: string
  mimeType: string
  url: string
  fileUniqueId: string | null
}

/** A stored attachment together with the Telegram message it came in. */
export interface StoredAttachmentInfo extends AttachmentStored {
  messageId: number | null
  /** The message's own date, when Telegram gave one. */
  at: Date | null
}

export interface AttachmentRefused {
  ok: false
  reason: 'too-big' | 'download' | 'upload'
  /** A sentence for the person. Never a stack trace, never empty. */
  message: string
}

export type AttachmentOutcome = AttachmentStored | AttachmentRefused

/**
 * Why a type guard rather than plain `if (outcome.ok)`.
 *
 * This project compiles with `strict: false`, and without `strictNullChecks`
 * TypeScript does NOT narrow a discriminated union by its boolean discriminant
 * -- `outcome.message` inside the else branch is an error, not a narrowing.
 * A user-defined guard narrows in both directions regardless, so the union
 * stays honest instead of degrading into optional fields on one loose object.
 */
export function attachmentRefused(
  outcome: AttachmentOutcome
): outcome is AttachmentRefused {
  return outcome.ok === false
}

/** Just enough of Telegraf's telegram client to fetch a file. */
export interface FileFetcher {
  getFileLink(fileId: string): Promise<URL | string>
  /**
   * The bot's token. It decides the ceiling (20 MB on the cloud, more on our
   * own server) and where the bytes are read from. `ctx.telegram` has it.
   */
  token?: string
  getFile?(fileId: string): Promise<{ file_path?: string; file_size?: number }>
}

/**
 * What the agent chat should do with this message.
 *
 * A separate result type rather than logic inlined in the middleware, because
 * the middleware lives inside a 2000-line registration function where nothing
 * can be tested. The three outcomes are the three things that can happen, and
 * `refusal` is deliberately independent of `text`: a file may fail to store
 * while the caption still deserves an answer.
 */
export interface AgentMessagePlan {
  /** The text to send the agent. Empty means there is nothing to send. */
  text: string
  /** A sentence to show the person first, when a file did not make it. */
  refusal: string | null
  /**
   * What DID make it, one per file, for the media library. The marker lines
   * inside `text` are unchanged; this is the same information in a shape a
   * caller can post without parsing them back.
   */
  stored: StoredAttachmentInfo[]
}

/**
 * Build what the agent should receive from a Telegram message.
 *
 * The caption IS the person's text: "make a reel out of this" arrives attached
 * to the photo, not as a separate message. Losing it would leave the agent with
 * a bare file and no instruction.
 */
export async function buildAgentMessage(
  telegram: FileFetcher,
  message: any
): Promise<AgentMessagePlan> {
  return buildAgentTurn(telegram, [message])
}

/**
 * Build ONE turn out of one message or out of a whole album.
 *
 * An album reaches Telegram as several updates sharing a `media_group_id`, and
 * only one of them carries the caption -- so the caption is looked for across
 * all the parts rather than taken from the first. Every attachment becomes its
 * own marker line under that single caption, which is what makes "which of
 * these is sharper?" a question about five photos instead of five questions
 * about one photo each.
 *
 * A single message is the same thing with one part, so there is one code path
 * and not two.
 */
export async function buildAgentTurn(
  telegram: FileFetcher,
  parts: any[]
): Promise<AgentMessagePlan> {
  const written = albumCaption(parts)

  const lines: string[] = []
  const refusals: string[] = []
  const stored: StoredAttachmentInfo[] = []
  for (const part of parts) {
    const attachment = attachmentFromMessage(part)
    if (!attachment) continue
    const outcome = await attachmentToLine(telegram, attachment)
    /*
     * ONE FAILED FILE DOES NOT SINK THE TURN. In an album the others may be
     * fine, and the caption is a question the agent can still answer. Each
     * refusal is named so the person knows WHICH file did not make it -- "one
     * of your photos failed" is not something anybody can act on.
     */
    if (attachmentRefused(outcome)) refusals.push(outcome.message)
    else {
      lines.push(outcome.line)
      const messageId = Number(part?.message_id)
      const date = Number(part?.date)
      stored.push({
        ...outcome,
        messageId: Number.isFinite(messageId) ? messageId : null,
        at: Number.isFinite(date) && date > 0 ? new Date(date * 1000) : null,
      })
    }
  }

  return {
    text: [written, ...lines].filter(Boolean).join('\n'),
    // Joined, not just the first: with three failures out of five, hearing
    // about one of them and silence about the rest is worse than a long
    // message.
    refusal: refusals.length ? refusals.join('\n') : null,
    stored,
  }
}

function megabytes(bytes: number): string {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} МБ`
}

/**
 * Turn an attachment into a line the agent can read.
 *
 * Every failure is a MESSAGE, not an exception: the caller's job is to tell the
 * person what happened, and a thrown error at this point would put us back to
 * the silence this module exists to end.
 */
export async function attachmentToLine(
  telegram: FileFetcher,
  a: TelegramAttachment
): Promise<AttachmentOutcome> {
  // Per bot: 20 MB on the cloud, 2000 MB on our own Bot API server.
  const ceiling = telegramDownloadLimitFor(telegram.token)
  if (a.bytes !== null && a.bytes > ceiling) {
    return {
      ok: false,
      reason: 'too-big',
      message:
        `«${a.name}» весит ${megabytes(a.bytes)}, а Telegram отдаёт этому ` +
        `боту не больше ${megabytes(ceiling)}. Пришлите файл полегче или ` +
        `загрузите его в приложении — там предел ${megabytes(SHELF_UPLOAD_LIMIT)}.`,
    }
  }

  if (botApiIsLocalFor(telegram.token) && telegram.getFile) {
    return streamedFromOurServer(telegram, a)
  }

  let bytes: Buffer
  try {
    // The link holds the bot token. It is used here and never returned,
    // logged, or written anywhere.
    const link = await telegram.getFileLink(a.fileId)
    const res = await fetch(String(link))
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    bytes = Buffer.from(await res.arrayBuffer())
  } catch (e) {
    logger.error('[вложения] не удалось скачать из Telegram', {
      kind: a.kind,
      // The name, not the link: the link carries the token.
      name: a.name,
      error: e instanceof Error ? e.message : String(e),
    })
    return {
      ok: false,
      reason: 'download',
      message: `«${a.name}» не скачался из Telegram. Попробуйте отправить ещё раз.`,
    }
  }

  if (!bytes.length) {
    return {
      ok: false,
      reason: 'download',
      message: `«${a.name}» пришёл пустым — отправьте файл ещё раз.`,
    }
  }

  // A real size beats a declared one: `file_size` is absent on video notes and
  // on some documents, so the ceiling has to be checked again on what actually
  // arrived. Otherwise an undeclared 60 MB file would sail through.
  if (bytes.length > ceiling) {
    return {
      ok: false,
      reason: 'too-big',
      message:
        `«${a.name}» весит ${megabytes(bytes.length)} — больше предела ` +
        `${megabytes(ceiling)} для файлов из Telegram.`,
    }
  }

  try {
    const artifact = await putBytes(bytes, a.name)
    return {
      ok: true,
      kind: a.kind,
      bytes: bytes.length,
      name: a.name,
      mimeType: a.mimeType,
      url: artifact.url,
      fileUniqueId: a.fileUniqueId,
      line: attachmentLine({
        kind: a.kind,
        name: a.name,
        mimeType: a.mimeType,
        url: artifact.url,
      }),
    }
  } catch (e) {
    logger.error('[вложения] не удалось положить на полку', {
      name: a.name,
      error: e instanceof Error ? e.message : String(e),
    })
    return {
      ok: false,
      reason: 'upload',
      message: `«${a.name}» не сохранился на нашей стороне. Попробуйте ещё раз.`,
    }
  }
}

/**
 * A file sent to a bot on our own Bot API server.
 *
 * Streamed from the server's private file endpoint straight onto the shelf
 * (services/telegramFiles.ts): up to 2000 MB may arrive, and none of it is held
 * in memory. The shelf is the tighter limit here, and it has its own sentence,
 * because "Telegram gives this bot at most 2000 MB" would be a false reason for
 * refusing a 150 MB video.
 */
async function streamedFromOurServer(
  telegram: FileFetcher,
  a: TelegramAttachment
): Promise<AttachmentOutcome> {
  const tooBigForShelf = (bytes: number): AttachmentRefused => ({
    ok: false,
    reason: 'too-big',
    message:
      `«${a.name}» весит ${megabytes(bytes)}, а мы храним файлы до ` +
      `${megabytes(SHELF_UPLOAD_LIMIT)} — как и приложение. Пришлите файл полегче.`,
  })
  if (a.bytes !== null && a.bytes > SHELF_UPLOAD_LIMIT) {
    return tooBigForShelf(a.bytes)
  }

  const failed = (
    stage: 'download' | 'upload',
    e: unknown
  ): AttachmentRefused => {
    logger.error('[attachments] our Bot API server: file did not make it', {
      kind: a.kind,
      // The name, never a URL or a path: both carry the token.
      name: a.name,
      stage,
      error: e instanceof Error ? e.name : String(e),
    })
    return stage === 'download'
      ? {
          ok: false,
          reason: 'download',
          message: `«${a.name}» не скачался из Telegram. Попробуйте отправить ещё раз.`,
        }
      : {
          ok: false,
          reason: 'upload',
          message: `«${a.name}» не сохранился на нашей стороне. Попробуйте ещё раз.`,
        }
  }

  let file: { file_path?: string; file_size?: number }
  try {
    file = await telegram.getFile!(a.fileId)
    if (!file?.file_path) throw new TelegramFileDownloadFailed('no file_path')
  } catch (e) {
    return failed('download', e)
  }

  try {
    const stored = await mirrorTelegramFile(
      telegram.token!,
      file.file_path!,
      a.name,
      { declaredBytes: a.bytes ?? file.file_size ?? null }
    )
    return {
      ok: true,
      kind: a.kind,
      bytes: stored.bytes,
      name: a.name,
      mimeType: a.mimeType,
      url: stored.url,
      fileUniqueId: a.fileUniqueId,
      line: attachmentLine({
        kind: a.kind,
        name: a.name,
        mimeType: a.mimeType,
        url: stored.url,
      }),
    }
  } catch (e) {
    if (e instanceof TelegramFileTooBig) return tooBigForShelf(e.bytes)
    return failed(
      e instanceof TelegramFileDownloadFailed ? 'download' : 'upload',
      e
    )
  }
}
