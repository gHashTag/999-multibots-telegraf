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
 * THE 20 MB CEILING IS TELEGRAM'S, NOT OURS
 *
 * The Bot API refuses `getFile` for anything larger than 20 MB, while the mini
 * app accepts 100 MB. Full parity is impossible without running a local Bot API
 * server. A file over the ceiling is refused with a sentence a person can act
 * on, because the failure mode we are replacing is silence.
 */

import { logger } from '@/utils/logger'
import { putBytes } from '@/services/contentFactory/storage'
import { albumCaption } from '@/services/albumBuffer'

/** The four buckets the mini app uses. Keep them identical: same vocabulary. */
export type AttachmentKind = 'image' | 'video' | 'audio' | 'file'

export interface TelegramAttachment {
  kind: AttachmentKind
  /** What to call it for a human. Never empty. */
  name: string
  mimeType: string
  fileId: string
  /** Telegram's own size, when it tells us. Null when it does not. */
  bytes: number | null
}

/**
 * The Bot API download ceiling.
 *
 * Not a policy of ours and not tunable: `getFile` answers "file is too big" for
 * anything above it, so checking earlier only changes WHO explains it.
 */
export const TELEGRAM_DOWNLOAD_LIMIT = 20 * 1024 * 1024

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
    else lines.push(outcome.line)
  }

  return {
    text: [written, ...lines].filter(Boolean).join('\n'),
    // Joined, not just the first: with three failures out of five, hearing
    // about one of them and silence about the rest is worse than a long
    // message.
    refusal: refusals.length ? refusals.join('\n') : null,
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
  if (a.bytes !== null && a.bytes > TELEGRAM_DOWNLOAD_LIMIT) {
    return {
      ok: false,
      reason: 'too-big',
      message:
        `«${a.name}» весит ${megabytes(a.bytes)}, а Telegram отдаёт ботам ` +
        `не больше ${megabytes(TELEGRAM_DOWNLOAD_LIMIT)}. Пришлите файл ` +
        'полегче или загрузите его в приложении — там предел 100 МБ.',
    }
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
  if (bytes.length > TELEGRAM_DOWNLOAD_LIMIT) {
    return {
      ok: false,
      reason: 'too-big',
      message:
        `«${a.name}» весит ${megabytes(bytes.length)} — больше предела ` +
        `${megabytes(TELEGRAM_DOWNLOAD_LIMIT)} для файлов из Telegram.`,
    }
  }

  try {
    const artifact = await putBytes(bytes, a.name)
    return {
      ok: true,
      kind: a.kind,
      bytes: bytes.length,
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
